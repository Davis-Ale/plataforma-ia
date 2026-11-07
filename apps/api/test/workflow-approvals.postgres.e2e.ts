import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@plataforma/database";
import { PasswordService } from "@plataforma/auth";
import { randomUUID } from "node:crypto";
import { ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import request from "supertest";
import { ScenariosModule } from "../src/scenarios/scenarios.module";
import { PrepareOperationService } from "../src/scenarios/prepare-operation.service";
import { WorkflowApprovalService } from "../src/scenarios/workflow-approval.service";
import { HumanApprovalService } from "../src/capabilities/human-approval.service";
import { CapabilityRegistry } from "../src/capabilities/capability-registry.service";
import { IntegrationRegistry } from "../src/integrations/integration-registry.service";
import { IntegrationResolver } from "../src/integrations/integration-resolver.service";
import { IntegrationBootstrapService } from "../src/integrations/integration-bootstrap.service";
import { createDemoContractsAdapter } from "../src/integrations/demo/demo-contracts.adapter";
import { createDemoOperationsAdapter } from "../src/integrations/demo/demo-operations.adapter";
import { createDemoPeopleAdapter } from "../src/integrations/demo/demo-people.adapter";
import { createContractsReadCapability } from "../src/integrations/contracts-read.capability";
import { createOperationsPlanCapability } from "../src/integrations/operations-plan.capability";
import { createPeopleCapacityCheckCapability } from "../src/integrations/people-capacity.capability";
import { BrowserClient } from "./browser-client";

type Actor = { id: string; email: string; accessToken: string; context: { companyId: string; userId: string; sessionId: string } };
type ApprovalItem = Awaited<ReturnType<WorkflowApprovalService["list"]>>["items"][number];

describe("Operational workflow approvals with PostgreSQL and Chrome", () => {
  const companyId = randomUUID();
  const foreignId = randomUUID();
  const requesterId = randomUUID();
  const approverId = randomUUID();
  const otherId = randomUUID();
  const password = "approval-ci-password";
  const browser = new BrowserClient();
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let requester: Actor;
  let approver: Actor;
  let other: Actor;
  let plans = 0;
  let reviewAllowed = true;
  let portal: ChildProcess | undefined;
  let portalLog = "";

  beforeAll(async () => {
    const database = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? "http://missing.invalid");
    if (process.env.CI !== "true" || database.protocol !== "postgresql:" || !["127.0.0.1", "localhost"].includes(database.hostname) ||
      database.pathname !== "/plataforma_portal_ci" || process.env.DATABASE_URL !== process.env.PORTAL_TEST_DATABASE_URL ||
      process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) throw new Error("Requires isolated local CI database without provider credentials");
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ScenariosModule] })
      .overrideProvider(IntegrationBootstrapService).useFactory({ inject: [IntegrationRegistry, IntegrationResolver, CapabilityRegistry],
        factory: (registry: IntegrationRegistry, resolver: IntegrationResolver, capabilities: CapabilityRegistry) => {
          const bootstrap = new IntegrationBootstrapService(registry, resolver, capabilities);
          return {
            enableDemoIntegrationsForCompany: bootstrap.enableDemoIntegrationsForCompany.bind(bootstrap),
            onModuleInit() {
              registry.registerContracts(createDemoContractsAdapter());
              const operations = createDemoOperationsAdapter();
              registry.registerOperations({ ...operations, plan: async (company, input) => { plans++; return operations.plan(company, input); } });
              registry.registerPeople(createDemoPeopleAdapter());
              capabilities.register(createContractsReadCapability(resolver));
              capabilities.register({ ...createOperationsPlanCapability(resolver), approval: { mode: "REQUIRED", approverRoles: ["ADMIN"] },
                authorize: async (context) => context.userId !== approverId || reviewAllowed });
              capabilities.register(createPeopleCapacityCheckCapability(resolver));
            },
          };
        },
      }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    prisma = app.get(PrismaService);
    await prisma.company.createMany({ data: [{ id: companyId, name: "Approval CI" }, { id: foreignId, name: "Other CI" }] });
    const passwordHash = await app.get(PasswordService).hash(password);
    for (const [id, role] of [[requesterId, "MEMBER"], [approverId, "ADMIN"], [otherId, "MEMBER"]] as const) {
      await prisma.user.create({ data: { id, email: `approval-${id}@example.com`, name: "Approval CI", passwordHash } });
      await prisma.companyUser.create({ data: { companyId, userId: id, role } });
    }
    await prisma.companyUser.create({ data: { companyId: foreignId, userId: approverId, role: "ADMIN" } });
    await app.get(IntegrationBootstrapService).enableDemoIntegrationsForCompany(companyId);
    requester = await actor(requesterId);
    approver = await actor(approverId);
    other = await actor(otherId);
  });

  afterAll(async () => {
    await browser.close();
    if (portal) {
      portal.kill("SIGTERM");
      if (portal.exitCode === null) await Promise.race([new Promise<void>((done) => portal!.once("exit", () => done())), delay(2000, undefined, { ref: false })]);
      if (portal.exitCode === null) portal.kill("SIGKILL");
    }
    if (prisma) {
      await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [requesterId, approverId, otherId] } } });
    }
    await app?.close();
  });

  beforeEach(() => { plans = 0; reviewAllowed = true; });

  async function actor(id: string): Promise<Actor> {
    const email = `approval-${id}@example.com`;
    const response = await request(app!.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
    expect(response.status).toBe(201);
    const session = await prisma.authSession.findFirstOrThrow({ where: { userId: id, revokedAt: null }, orderBy: { createdAt: "desc" } });
    return { id, email, accessToken: response.body.accessToken, context: { companyId, userId: id, sessionId: session.id } };
  }

  function list(user = approver, status = "PENDING", company = companyId) {
    return request(app!.getHttpServer()).get(`/api/v1/approvals/executions?status=${status}`)
      .auth(user.accessToken, { type: "bearer" }).set("X-Company-Id", company);
  }

  function decide(id: string, token: string, decision = "APPROVED", user = approver, company = companyId) {
    return request(app!.getHttpServer()).post(`/api/v1/approvals/executions/${id}/decision`)
      .auth(user.accessToken, { type: "bearer" }).set("X-Company-Id", company).send({ decision, reviewToken: token });
  }

  async function pending() {
    const response = await request(app!.getHttpServer()).post("/api/v1/scenarios/operations/prepare-from-contract")
      .auth(requester.accessToken, { type: "bearer" }).set("X-Company-Id", companyId).send({ contractExternalRef: "ATLAS", operationId: randomUUID() });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: false, error: "APPROVAL_REQUIRED" });
    const items = await list();
    expect(items.status).toBe(200);
    const item = (items.body.items as ApprovalItem[]).find((item) => item.id === response.body.approvalId)!;
    expect(item).toMatchObject({ canDecide: true, status: "PENDING", review: { workflowRunId: response.body.workflowRunId } });
    return item;
  }

  it("exposes only verified action fields to an authorized reviewer and never executes on approval", async () => {
    const item = await pending();
    expect(item.review!.fields.map((field) => field.label)).toEqual(["Referência do contrato", "Contrato", "Cliente", "Data de início"]);
    expect(JSON.stringify(item)).not.toMatch(/inputHash|passwordHash|sourceAdapter/);
    const response = await decide(item.id, item.review!.token);
    expect(response.status).toBe(200);
    expect(plans).toBe(0);
    expect(await prisma.workflowExecution.findUnique({ where: { workflowRunId: item.review!.workflowRunId } })).toMatchObject({ state: "WAITING" });
    expect((await list(requester, "APPROVED")).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: item.id, canDecide: false })]));
  });

  it("preserves an approved decision through an integration lookup failure before dispatch", async () => {
    const item = await pending();
    const workflowRunId = item.review!.workflowRunId;
    expect((await decide(item.id, item.review!.token)).status).toBe(200);
    const lookup = jest.spyOn(app!.get(IntegrationResolver), "resolveOperations").mockRejectedValueOnce(new Error("lookup unavailable"));
    const scenario = app!.get(PrepareOperationService);
    try {
      expect(await scenario.resume(requester.context, workflowRunId)).toMatchObject({ success: false, error: "INTEGRATION_UNAVAILABLE" });
    } finally {
      lookup.mockRestore();
    }
    expect(plans).toBe(0);
    expect(await prisma.workflowCheckpoint.findFirst({ where: { workflowRunId, capabilityKey: "operations.plan" } }))
      .toMatchObject({ state: "APPROVAL_REQUIRED", approvalId: item.id, attemptCount: 1 });
    expect((await list(requester, "APPROVED")).body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: item.id, review: expect.objectContaining({ workflowRunId }), canDecide: false }),
    ]));
    expect(await scenario.resume(requester.context, workflowRunId)).toMatchObject({ success: true });
    expect(plans).toBe(1);
    expect(await prisma.capabilityApproval.findUnique({ where: { id: item.id } })).toMatchObject({ status: "CONSUMED" });
  });

  it("rejects self-decision, unrelated members, foreign tenants and caller-controlled identity", async () => {
    const item = await pending();
    expect((await list(other)).body.items).toHaveLength(0);
    expect((await list(approver, "PENDING", foreignId)).body.items).toHaveLength(0);
    expect((await decide(item.id, item.review!.token, "APPROVED", other)).status).toBe(403);
    expect((await decide(item.id, item.review!.token, "APPROVED", approver, foreignId)).status).toBe(403);
    await prisma.companyUser.updateMany({ where: { companyId, userId: requesterId }, data: { role: "ADMIN" } });
    try { expect((await decide(item.id, item.review!.token, "APPROVED", requester)).status).toBe(403); }
    finally { await prisma.companyUser.updateMany({ where: { companyId, userId: requesterId }, data: { role: "MEMBER" } }); }
    const tampered = await request(app!.getHttpServer()).post(`/api/v1/approvals/executions/${item.id}/decision`)
      .auth(approver.accessToken, { type: "bearer" }).set("X-Company-Id", companyId)
      .send({ decision: "APPROVED", reviewToken: item.review!.token, companyId: foreignId, userId: requesterId, purpose: "GENERATION" });
    expect(tampered.status).toBe(400);
    expect(await prisma.capabilityApproval.findUnique({ where: { id: item.id } })).toMatchObject({ status: "PENDING" });
  });

  it("revalidates the current session and domain authorization before a decision", async () => {
    const item = await pending();
    reviewAllowed = false;
    expect((await decide(item.id, item.review!.token)).status).toBe(403);
    expect((await list()).body.items.find((row: ApprovalItem) => row.id === item.id)).toMatchObject({ review: null, canDecide: false });
    reviewAllowed = true;
    await prisma.authSession.update({ where: { id: approver.context.sessionId }, data: { revokedAt: new Date() } });
    try { expect((await decide(item.id, item.review!.token)).status).toBe(401); }
    finally { await prisma.authSession.update({ where: { id: approver.context.sessionId }, data: { revokedAt: null } }); }
  });

  it("rejects stale or modified review context and ambiguous checkpoint association", async () => {
    const item = await pending();
    expect((await decide(item.id, "0".repeat(64))).status).toBe(403);
    const completed = await prisma.workflowCheckpoint.findFirstOrThrow({ where: { workflowRunId: item.review!.workflowRunId, state: "COMPLETED" }, include: { step: true } });
    await expect(prisma.workflowCheckpoint.update({ where: { workflowStepId: completed.workflowStepId }, data: { approvalId: item.id } })).rejects.toMatchObject({ code: "P2002" });
    await prisma.workflowStep.update({ where: { id: completed.workflowStepId }, data: { output: { ...(completed.step.output as object), clientName: "Changed CI context" } } });
    expect((await decide(item.id, item.review!.token)).status).toBe(403);
    expect((await list()).body.items.find((row: ApprovalItem) => row.id === item.id)).toMatchObject({ review: null, canDecide: false });
  });

  it("records one concurrent decision and blocks recovery after rejection", async () => {
    const item = await pending();
    const responses = await Promise.all([decide(item.id, item.review!.token, "APPROVED"), decide(item.id, item.review!.token, "REJECTED")]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 403]);
    expect(await prisma.auditLog.count({ where: { resource: "capability_approval", resourceId: item.id, action: "UPDATE" } })).toBe(1);
    const rejected = await pending();
    expect((await decide(rejected.id, rejected.review!.token, "REJECTED")).status).toBe(200);
    expect(await prisma.workflowRun.findUnique({ where: { id: rejected.review!.workflowRunId } })).toMatchObject({ error: "APPROVAL_REJECTED" });
    expect(await app!.get(PrepareOperationService).resume(requester.context, rejected.review!.workflowRunId)).toMatchObject({ success: false, error: "APPROVAL_REJECTED" });
    expect(plans).toBe(0);
  });

  it("rolls the decision back if related state finalization fails", async () => {
    const item = await pending();
    expect(await app!.get(HumanApprovalService).decide(approver.context, item.id, "APPROVED", "EXECUTION", {
      verify: async () => true, afterDecision: async () => { throw new Error("isolated finalization failure"); },
    })).toMatchObject({ success: false, error: "DENIED" });
    expect(await prisma.capabilityApproval.findUnique({ where: { id: item.id } })).toMatchObject({ status: "PENDING" });
    expect(await prisma.auditLog.count({ where: { resourceId: item.id, action: "UPDATE" } })).toBe(0);
  });

  it("approves through the portal and resumes as the original requester with one-time consumption", async () => {
    const item = await pending();
    const web = resolve(__dirname, "../../../apps/web");
    const next = require.resolve("next/dist/bin/next", { paths: [web] });
    const url = "http://127.0.0.1:3002";
    portal = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", "3002"], { cwd: web,
      env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_API_URL: `${await app!.getUrl()}/api/v1` }, stdio: ["ignore", "pipe", "pipe"] });
    portal.stdout!.on("data", (chunk) => { portalLog += String(chunk); });
    portal.stderr!.on("data", (chunk) => { portalLog += String(chunk); });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (portal.exitCode !== null) throw new Error(portalLog);
      ready = await fetch(url).then((response) => response.ok).catch(() => false);
      if (ready) break;
      await delay(100);
    }
    if (!ready) throw new Error(`Portal unavailable: ${portalLog}`);
    await browser.start(url);
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await browser.waitFor('!!document.querySelector("input[type=email]")');
    const login = async (user: Actor) => {
      await browser.evaluate('fetch("/api/session/logout",{method:"POST"})');
      expect(await browser.evaluate(`fetch("/api/session/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(${JSON.stringify({ email: user.email, password })})}).then(response=>response.ok)`)).toBe(true);
      await browser.send("Page.reload");
      await browser.waitFor('!!document.querySelector(".topbar")');
      await browser.evaluate(`(() => {const select=document.querySelector('select[aria-label="Empresa"]');if(select){select.value=${JSON.stringify(companyId)};select.dispatchEvent(new Event("change",{bubbles:true}));}})()`);
    };
    const openApprovals = async () => {
      await browser.evaluate('Array.from(document.querySelectorAll("button.nav-item")).find(button=>button.textContent.trim()==="Aprovações").click()');
      await browser.waitFor(`!!document.querySelector('article[data-approval-id="${item.id}"]')`);
    };
    await login(approver);
    await openApprovals();
    await browser.evaluate(`document.querySelector('article[data-approval-id="${item.id}"] button[data-decision="APPROVED"]').click()`);
    await browser.waitFor(`!document.querySelector('article[data-approval-id="${item.id}"]')`);
    expect(await prisma.capabilityApproval.findUnique({ where: { id: item.id } })).toMatchObject({ status: "APPROVED" });
    expect(plans).toBe(0);
    await login(requester);
    await browser.evaluate('Array.from(document.querySelectorAll("button.nav-item")).find(button=>button.textContent.trim()==="Aprovações").click()');
    await browser.waitFor(`!!document.querySelector('select[aria-label="Filtrar aprovações"]')`);
    await browser.evaluate(`(() => {const select=document.querySelector('select[aria-label="Filtrar aprovações"]');select.value="APPROVED";select.dispatchEvent(new Event("change",{bubbles:true}));})()`);
    await browser.waitFor(`!!document.querySelector('article[data-approval-id="${item.id}"]')`);
    await browser.evaluate(`document.querySelector('article[data-approval-id="${item.id}"] .approval-open').click()`);
    await browser.waitFor('!!Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Retomar execução")');
    await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Retomar execução").click()');
    await browser.waitFor('!!document.querySelector(".detail-heading .status-completed")');
    expect(plans).toBe(1);
    expect(await prisma.capabilityApproval.findUnique({ where: { id: item.id } })).toMatchObject({ status: "CONSUMED" });
    expect(await app!.get(PrepareOperationService).resume(requester.context, item.review!.workflowRunId)).toMatchObject({ success: true });
    expect(plans).toBe(1);
  });
});
