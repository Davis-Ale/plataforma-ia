import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@plataforma/database";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ScenariosModule } from "../src/scenarios/scenarios.module";
import { ExecutionIntegrityService } from "../src/scenarios/execution-integrity.service";
import { PrepareOperationService } from "../src/scenarios/prepare-operation.service";
import { AuthorizationGateway } from "../src/capabilities/authorization-gateway.service";
import { IntegrationRegistry } from "../src/integrations/integration-registry.service";
import { IntegrationResolver } from "../src/integrations/integration-resolver.service";
import { createDemoContractsAdapter } from "../src/integrations/demo/demo-contracts.adapter";
import { createDemoOperationsAdapter } from "../src/integrations/demo/demo-operations.adapter";
import { createDemoPeopleAdapter } from "../src/integrations/demo/demo-people.adapter";

describe("Execution integrity with isolated PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let integrity: ExecutionIntegrityService;
  let scenario: PrepareOperationService;
  let resolver: IntegrationResolver;
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const otherSessionId = randomUUID();
  const sessionId = randomUUID();
  const companyId = randomUUID();
  const foreignId = randomUUID();
  const context = { companyId, userId, sessionId };
  const calls = { contracts: 0, operations: 0, people: 0 };
  let failures = 0;

  beforeAll(async () => {
    const database = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? "http://missing.invalid");
    if (process.env.CI !== "true" || database.protocol !== "postgresql:" || !["127.0.0.1", "localhost"].includes(database.hostname) ||
      database.pathname !== "/plataforma_portal_ci" || process.env.DATABASE_URL !== process.env.PORTAL_TEST_DATABASE_URL ||
      process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) throw new Error("Requires isolated local CI database without provider credentials");
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ScenariosModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    integrity = app.get(ExecutionIntegrityService);
    scenario = app.get(PrepareOperationService);
    resolver = app.get(IntegrationResolver);
    await prisma.company.createMany({ data: [{ id: companyId, name: "Integrity QA" }, { id: foreignId, name: "Foreign QA" }] });
    await prisma.user.create({ data: { id: userId, email: `integrity-${userId}@example.com`, name: "Integrity QA", passwordHash: "unused-test-only" } });
    await prisma.user.create({ data: { id: otherUserId, email: `integrity-${otherUserId}@example.com`, name: "Other QA", passwordHash: "unused-test-only" } });
    await prisma.companyUser.create({ data: { companyId, userId: otherUserId, role: "ADMIN" } });
    await prisma.authSession.create({ data: { id: otherSessionId, userId: otherUserId, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    await prisma.companyUser.createMany({ data: [companyId, foreignId].map((id) => ({ companyId: id, userId, role: "MEMBER" })) });
    await prisma.authSession.create({ data: { id: sessionId, userId, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    const registry = app.get(IntegrationRegistry);
    const contracts = createDemoContractsAdapter();
    const operations = createDemoOperationsAdapter();
    const people = createDemoPeopleAdapter();
    registry.registerContracts({ ...contracts, key: "qa-contracts", read: async (company, input) => {
      calls.contracts++; return { ...await contracts.read(company, input), sourceAdapter: "qa-contracts" };
    } });
    registry.registerOperations({ ...operations, key: "qa-operations", plan: async (company, input) => {
      calls.operations++;
      if (failures-- > 0) throw new Error("isolated adapter interruption");
      return { ...await operations.plan(company, input), sourceAdapter: "qa-operations" };
    } });
    registry.registerPeople({ ...people, key: "qa-people", checkCapacity: async (company, input) => {
      calls.people++; return { ...await people.checkCapacity(company, input), sourceAdapter: "qa-people" };
    } });
    await resolver.bind({ companyId, kind: "contracts", adapterKey: "qa-contracts" });
    await resolver.bind({ companyId, kind: "operations", adapterKey: "qa-operations" });
    await resolver.bind({ companyId, kind: "people", adapterKey: "qa-people" });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    }
    await app?.close();
  });

  beforeEach(() => { failures = 0; calls.contracts = 0; calls.operations = 0; calls.people = 0; });

  async function open(safety: "MANUAL" | "READ_ONLY" = "MANUAL") {
    const run = await integrity.open(context, "qa.execution", { value: "qa" }, randomUUID(), "1", [
      { stepKey: "qa", capabilityKey: "qa.action", integrationKind: "contracts" },
    ]);
    const claim = await integrity.claim(context, run.id, "1");
    expect(claim.token).toBeTruthy();
    const stepId = claim.execution.checkpoints[0].workflowStepId;
    await integrity.dispatch(context, run.id, claim.token!, stepId, "qa-adapter", safety);
    return { id: run.id, token: claim.token!, stepId };
  }

  async function expire(id: string) {
    await prisma.workflowExecution.update({ where: { workflowRunId: id }, data: { leaseUntil: new Date(0) } });
  }

  it("resumes with a new service instance without repeating completed steps or duplicate requests", async () => {
    failures = 1;
    const input = { contractExternalRef: "ATLAS", operationId: randomUUID() };
    const failed = await scenario.run(context, input);
    expect(failed).toMatchObject({ success: false, error: "EXECUTION_FAILED" });
    const restarted = new PrepareOperationService(new ExecutionIntegrityService(prisma), app.get(AuthorizationGateway), resolver);
    const recovered = await restarted.run(context, input);
    expect(recovered.success).toBe(true);
    expect(calls).toEqual({ contracts: 1, operations: 2, people: 1 });
    expect((await restarted.run(context, input)).success).toBe(true);
    expect(calls).toEqual({ contracts: 1, operations: 2, people: 1 });
    expect(await prisma.workflowIncident.count({ where: { workflowRunId: failed.workflowRunId, resolvedAt: { not: null } } })).toBe(1);
    expect(await prisma.workflowExecution.findUnique({ where: { workflowRunId: failed.workflowRunId } })).toMatchObject({ simulated: true, attemptCount: 2 });
  });

  it("halts when a binding lookup fails and resumes without repeating the completed step", async () => {
    const lookup = jest.spyOn(resolver, "resolveOperations").mockRejectedValueOnce(new Error("binding lookup failed"));
    const input = { contractExternalRef: "ATLAS", operationId: randomUUID() };
    let runId: string;
    try {
      const result = await scenario.run(context, input);
      expect(result).toMatchObject({ success: false, error: "INTEGRATION_UNAVAILABLE", failedStep: "plan_operations" });
      runId = result.workflowRunId!;
    } finally {
      lookup.mockRestore();
    }

    expect(calls).toEqual({ contracts: 1, operations: 0, people: 0 });
    expect(await prisma.workflowExecution.findUnique({ where: { workflowRunId: runId } })).toMatchObject({ state: "FAILED", leaseToken: null });
    expect(await prisma.workflowCheckpoint.findFirst({ where: { workflowRunId: runId, capabilityKey: "operations.plan" } })).toMatchObject({ attemptCount: 0 });
    expect(await prisma.workflowIncident.count({ where: { workflowRunId: runId, code: "INTEGRATION_UNAVAILABLE", resolvedAt: null } })).toBe(1);

    expect(await scenario.resume(context, runId)).toMatchObject({ success: true });
    expect(calls).toEqual({ contracts: 1, operations: 1, people: 1 });
    expect(await prisma.workflowIncident.count({ where: { workflowRunId: runId, code: "INTEGRATION_UNAVAILABLE", resolvedAt: { not: null } } })).toBe(1);
  });

  it("persists uncertain incidents when recovery is blocked and rejects stale completion", async () => {
    const run = await open();
    await expire(run.id);
    const recovery = await integrity.claim(context, run.id, "1");
    expect(recovery).toMatchObject({ token: null, blocked: "RECONCILIATION_REQUIRED" });
    expect(await prisma.workflowCheckpoint.findUnique({ where: { workflowStepId: run.stepId } })).toMatchObject({ state: "UNKNOWN" });
    expect(await prisma.workflowIncident.count({ where: { workflowRunId: run.id, code: "EXECUTION_INTERRUPTED" } })).toBe(1);
    await expect(integrity.checkpoint(context, run.id, run.token, run.stepId, { value: "late" })).rejects.toThrow("lease");
    await integrity.inspect(context, run.id);
    expect(await prisma.workflowIncident.count({ where: { workflowRunId: run.id } })).toBe(1);
  });

  it("allows only one concurrent recovery and fences the previous owner", async () => {
    const run = await open("READ_ONLY");
    await expire(run.id);
    const results = await Promise.all([integrity.claim(context, run.id, "1"), integrity.claim(context, run.id, "1")]);
    expect(results.filter((item) => item.token !== null)).toHaveLength(1);
    expect(results.filter((item) => item.token === null)).toHaveLength(1);
    await expect(integrity.heartbeat(context, run.id, run.token)).rejects.toThrow("lease");
    await expect(integrity.finish(context, run.id, results.find((item) => item.token)!.token!, {})).rejects.toThrow("unfinished");
  });

  it("records one authorized reconciliation and permits a fresh attempt only after confirmed non-execution", async () => {
    const run = await open();
    await expire(run.id);
    await integrity.inspect(context, run.id);
    const incident = await prisma.workflowIncident.findFirstOrThrow({ where: { workflowRunId: run.id } });
    const decision = { incidentId: incident.id, outcome: "NOT_APPLIED" as const, evidenceReference: "QA-123" };
    const reviewer = { companyId, userId: otherUserId, sessionId: otherSessionId };
    await expect(integrity.reconcile(context, run.id, decision)).rejects.toThrow("not authorized");
    await expect(integrity.reconcile(reviewer, run.id, { ...decision, incidentId: randomUUID() })).rejects.toThrow("Incident");
    await prisma.authSession.update({ where: { id: otherSessionId }, data: { revokedAt: new Date() } });
    try { await expect(integrity.reconcile(reviewer, run.id, decision)).rejects.toThrow("not authorized"); }
    finally { await prisma.authSession.update({ where: { id: otherSessionId }, data: { revokedAt: null } }); }
    const submissions = await Promise.allSettled([
      integrity.reconcile(reviewer, run.id, decision), integrity.reconcile(reviewer, run.id, decision),
    ]);
    expect(submissions.map((submission) => submission.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await prisma.workflowIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      reconciliationOutcome: "NOT_APPLIED", reconciledAt: expect.any(Date), resolvedAt: expect.any(Date),
    });
    expect(await prisma.workflowCheckpoint.findUnique({ where: { workflowStepId: run.stepId } })).toMatchObject({ state: "READY", approvalId: null });
    expect(await prisma.auditLog.findMany({ where: {
      companyId, resourceId: run.id, metadata: { path: ["event"], equals: "RECONCILED" },
    } })).toEqual([expect.objectContaining({ userId: otherUserId, metadata: expect.objectContaining({
      incidentId: incident.id, outcome: "NOT_APPLIED", evidenceReference: "QA-123",
    }) })]);
    const recovery = await integrity.claim(context, run.id, "1");
    expect(recovery.token).toBeTruthy();
    await expect(integrity.checkpoint(context, run.id, run.token, run.stepId, { value: "late" })).rejects.toThrow("lease");
  });

  it("records a confirmed external effect without replaying the step or fabricating its output", async () => {
    const run = await open();
    await expire(run.id);
    await integrity.inspect(context, run.id);
    const incident = await prisma.workflowIncident.findFirstOrThrow({ where: { workflowRunId: run.id } });
    await integrity.reconcile({ companyId, userId: otherUserId, sessionId: otherSessionId }, run.id, {
      incidentId: incident.id, outcome: "APPLIED", evidenceReference: "QA-456",
    });
    expect(await prisma.workflowIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      reconciliationOutcome: "APPLIED", reconciledAt: expect.any(Date), resolvedAt: null,
    });
    expect(await integrity.claim(context, run.id, "1")).toMatchObject({ token: null, blocked: "RECONCILIATION_REQUIRED" });
    expect(await prisma.workflowStep.findUnique({ where: { id: run.stepId } })).toMatchObject({ status: "FAILED", output: null });
  });

  it("enforces tenant isolation, current session and original requester before recovery", async () => {
    const run = await open("READ_ONLY");
    await expect(integrity.claim({ ...context, companyId: foreignId }, run.id, "1")).rejects.toThrow("not found");
    await expect(integrity.claim({ companyId, userId: otherUserId, sessionId: otherSessionId }, run.id, "1")).rejects.toThrow("original requester");
    await prisma.authSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    try { await expect(integrity.claim(context, run.id, "1")).rejects.toThrow("not authorized"); }
    finally { await prisma.authSession.update({ where: { id: sessionId }, data: { revokedAt: null } }); }
    await prisma.workflowExecution.update({ where: { workflowRunId: run.id }, data: { requestedByUserId: userId, attemptCount: 3, leaseUntil: new Date(0) } });
    expect(await integrity.claim(context, run.id, "1")).toMatchObject({ token: null, blocked: "ATTEMPT_LIMIT" });
    expect(await prisma.workflowIncident.count({ where: { workflowRunId: run.id } })).toBe(1);
  });

  it("does not revive a cancelled run when its lease expires", async () => {
    const run = await open("READ_ONLY");
    await expire(run.id);
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "CANCELLED" } });
    await integrity.inspect(context, run.id);
    expect(await integrity.claim(context, run.id, "1")).toMatchObject({ token: null, blocked: "CANCELLED" });
    expect(await prisma.workflowRun.findUnique({ where: { id: run.id } })).toMatchObject({ status: "CANCELLED" });
  });

  it("rolls back a checkpoint when its audit cannot be persisted", async () => {
    const run = await open();
    const failing = new ExecutionIntegrityService({
      $transaction: (action: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction((tx) => action(new Proxy(tx, {
        get(target, property) {
          if (property === "auditLog") return { create: async () => { throw new Error("isolated audit failure"); } };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }))),
    } as unknown as PrismaService);
    await expect(failing.checkpoint(context, run.id, run.token, run.stepId, { value: "known" })).rejects.toThrow("audit failure");
    expect(await prisma.workflowCheckpoint.findUnique({ where: { workflowStepId: run.stepId } })).toMatchObject({ state: "DISPATCHED" });
    expect(await prisma.workflowStep.findUnique({ where: { id: run.stepId } })).toMatchObject({ status: "RUNNING", output: null });
    await expire(run.id);
    expect(await integrity.claim(context, run.id, "1")).toMatchObject({ token: null, blocked: "RECONCILIATION_REQUIRED" });
  });
});
