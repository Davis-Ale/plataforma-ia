import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { randomUUID } from "node:crypto";
import { AuthorizationGateway } from "../src/capabilities/authorization-gateway.service";
import { INTEGRATION_BINDING_STORE, IntegrationBindingStore } from "../src/integrations/integration-binding.store";
import { PrismaIntegrationBindingStore } from "../src/integrations/prisma-integration-binding.store";
import { IntegrationBootstrapService } from "../src/integrations/integration-bootstrap.service";
import { IntegrationResolver } from "../src/integrations/integration-resolver.service";
import { IntegrationRegistry } from "../src/integrations/integration-registry.service";
import { createDemoContractsAdapter, DEMO_CONTRACTS_ADAPTER_KEY } from "../src/integrations/demo/demo-contracts.adapter";
import { DEMO_OPERATIONS_ADAPTER_KEY } from "../src/integrations/demo/demo-operations.adapter";
import { ExecutionIntegrityService } from "../src/scenarios/execution-integrity.service";
import { PrepareOperationService, PREPARE_OPERATION_VERSION, PREPARE_OPERATION_WORKFLOW_KEY } from "../src/scenarios/prepare-operation.service";
import { ScenariosModule } from "../src/scenarios/scenarios.module";

describe("Persistent integration bindings with isolated PostgreSQL", () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  const companies: string[] = [];
  const userId = randomUUID();
  const sessionId = randomUUID();

  async function start() {
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ScenariosModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  }

  async function restart() {
    await app!.close();
    app = undefined;
    await start();
  }

  beforeAll(async () => {
    const database = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? "http://missing.invalid");
    if (process.env.CI !== "true" || database.protocol !== "postgresql:" || !["127.0.0.1", "localhost"].includes(database.hostname) ||
      database.pathname !== "/plataforma_portal_ci" || process.env.DATABASE_URL !== process.env.PORTAL_TEST_DATABASE_URL ||
      process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) throw new Error("Requires isolated local CI database without provider credentials");
    await start();
    await prisma.user.create({ data: { id: userId, email: `bindings-${userId}@example.com`, name: "Binding QA", passwordHash: "unused-test-only" } });
    await prisma.authSession.create({ data: { id: sessionId, userId, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.company.deleteMany({ where: { id: { in: companies } } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  async function company() {
    const id = randomUUID();
    await prisma.company.create({ data: { id, name: "Binding QA" } });
    companies.push(id);
    await prisma.companyUser.create({ data: { companyId: id, userId, role: "MEMBER" } });
    return id;
  }

  const store = () => app!.get<IntegrationBindingStore>(INTEGRATION_BINDING_STORE);
  const resolver = () => app!.get(IntegrationResolver);
  const binding = (companyId: string, adapterKey = DEMO_CONTRACTS_ADAPTER_KEY) => ({ companyId, kind: "contracts" as const, adapterKey });
  const audits = (companyId: string) => prisma.auditLog.count({ where: { companyId, resource: "integration_binding" } });

  it("does not automatically enable demos and restores explicit configuration after restarting Nest", async () => {
    const companyId = await company();
    expect(store()).toBeInstanceOf(PrismaIntegrationBindingStore);
    expect(await resolver().resolveContracts(companyId)).toBeUndefined();
    expect(await prisma.integrationBinding.count({ where: { companyId } })).toBe(0);
    await app!.get(IntegrationBootstrapService).enableDemoIntegrationsForCompany(companyId);
    await restart();
    expect((await resolver().resolveContracts(companyId))?.key).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
    expect((await resolver().resolveOperations(companyId))?.key).toBe(DEMO_OPERATIONS_ADAPTER_KEY);
    expect(await prisma.integrationBinding.count({ where: { companyId } })).toBe(3);
    expect(await audits(companyId)).toBe(3);
  });

  it("creates exactly one audited binding under concurrent callers", async () => {
    const companyId = await company();
    const results = await Promise.all([store().create(binding(companyId)), store().create(binding(companyId))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.integrationBinding.count({ where: { companyId } })).toBe(1);
    expect(await audits(companyId)).toBe(1);
  });

  it("rejects competing revisions and stale changes after an adapter-key round trip", async () => {
    const companyId = await company();
    const demo = createDemoContractsAdapter();
    for (const key of ["qa-binding-left", "qa-binding-right"]) app!.get(IntegrationRegistry).registerContracts({ ...demo, key });
    await resolver().bind(binding(companyId));
    const results = await Promise.all([
      store().replace(binding(companyId, "qa-binding-left"), 1), store().replace(binding(companyId, "qa-binding-right"), 1),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store().find(companyId, "contracts")).toMatchObject({ revision: 2 });
    expect(await audits(companyId)).toBe(2);
    expect(await store().replace(binding(companyId), 2)).toBe(true);
    expect(await store().replace(binding(companyId, "qa-binding-left"), 1)).toBe(false);
    expect(await store().find(companyId, "contracts")).toMatchObject({ adapterKey: DEMO_CONTRACTS_ADAPTER_KEY, revision: 3 });
    expect(await audits(companyId)).toBe(3);
  });

  it("rolls back both creation and replacement when audit storage fails", async () => {
    const companyId = await company();
    const failing = new PrismaIntegrationBindingStore({
      $transaction: (action: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction((tx) => action(new Proxy(tx, {
        get(target, property) {
          if (property === "auditLog") return { create: async () => { throw new Error("isolated binding audit failure"); } };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }))),
    } as unknown as PrismaService);
    await expect(failing.create(binding(companyId))).rejects.toThrow("audit failure");
    expect(await store().find(companyId, "contracts")).toBeUndefined();
    await store().create(binding(companyId));
    await expect(failing.replace(binding(companyId, "qa-replacement"), 1)).rejects.toThrow("audit failure");
    expect(await store().find(companyId, "contracts")).toMatchObject({ adapterKey: DEMO_CONTRACTS_ADAPTER_KEY, revision: 1 });
    expect(await audits(companyId)).toBe(1);
  });

  it("isolates company records and denies configuration for missing or inactive companies", async () => {
    const companyId = await company();
    const foreignId = await company();
    await resolver().bind(binding(companyId));
    expect(await resolver().resolveContracts(foreignId)).toBeUndefined();
    await expect(store().create(binding(randomUUID()))).rejects.toThrow("Active integration company not found");
    await prisma.company.update({ where: { id: companyId }, data: { status: "INACTIVE" } });
    expect(await resolver().resolveContracts(companyId)).toBeUndefined();
    await expect(store().replace(binding(companyId, "qa-blocked"), 1)).rejects.toThrow("Active integration company not found");
    await prisma.company.update({ where: { id: companyId }, data: { status: "ACTIVE" } });
    expect((await resolver().resolveContracts(companyId))?.key).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
  });

  it("fails closed without substituting a demo when the saved adapter is unavailable after restart", async () => {
    const companyId = await company();
    await store().create(binding(companyId, "adapter-not-installed"));
    await restart();
    expect(await resolver().resolveContracts(companyId)).toBeUndefined();
    expect(await store().find(companyId, "contracts")).toMatchObject({ adapterKey: "adapter-not-installed", revision: 1 });
    expect(await prisma.integrationBinding.count({ where: { companyId } })).toBe(1);
  });

  it("recovers an interrupted scenario after restarting the application without reconfiguring or repeating its completed read", async () => {
    const companyId = await company();
    await app!.get(IntegrationBootstrapService).enableDemoIntegrationsForCompany(companyId);
    const context = { companyId, userId, sessionId, correlationId: randomUUID() };
    const operationId = randomUUID();
    const integrity = app!.get(ExecutionIntegrityService);
    const run = await integrity.open(context, PREPARE_OPERATION_WORKFLOW_KEY, {
      contractExternalRef: "ATLAS", scenario: "new_contract", areas: ["contracts", "operations", "people"],
    }, operationId, PREPARE_OPERATION_VERSION, [
      { stepKey: "read_contract", capabilityKey: "contracts.read", integrationKind: "contracts" },
      { stepKey: "plan_operations", capabilityKey: "operations.plan", integrationKind: "operations" },
      { stepKey: "check_capacity", capabilityKey: "people.capacity.check", integrationKind: "people" },
    ]);
    const claim = await integrity.claim(context, run.id, PREPARE_OPERATION_VERSION);
    const readId = claim.execution.checkpoints[0].workflowStepId;
    await integrity.dispatch(context, run.id, claim.token!, readId, DEMO_CONTRACTS_ADAPTER_KEY, "READ_ONLY");
    const contract = await app!.get(AuthorizationGateway).execute(context, { capability: "contracts.read", input: { externalRef: "ATLAS" } });
    if (!contract.success) throw new Error("Fixture contract read failed");
    await integrity.checkpoint(context, run.id, claim.token!, readId, contract.output as Prisma.InputJsonValue);
    await integrity.dispatch(context, run.id, claim.token!, claim.execution.checkpoints[1].workflowStepId, DEMO_OPERATIONS_ADAPTER_KEY, "PURE");
    await prisma.workflowExecution.update({ where: { workflowRunId: run.id }, data: { leaseUntil: new Date(0) } });
    await restart();
    const execute = jest.spyOn(app!.get(AuthorizationGateway), "execute");
    const result = await app!.get(PrepareOperationService).run(context, { contractExternalRef: "ATLAS", operationId });
    expect(result).toMatchObject({ success: true, workflowRunId: run.id });
    expect(execute.mock.calls.map(([, request]) => request.capability)).toEqual(["operations.plan", "people.capacity.check"]);
    execute.mockRestore();
    expect(await prisma.workflowCheckpoint.findUnique({ where: { workflowStepId: readId } })).toMatchObject({ state: "COMPLETED", attemptCount: 1 });
    expect(await prisma.workflowIncident.count({ where: { workflowRunId: run.id, resolvedAt: { not: null } } })).toBe(1);
    expect(await audits(companyId)).toBe(3);
  });
});
