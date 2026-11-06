import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PasswordService } from "@plataforma/auth";
import { PrismaService } from "@plataforma/database";
import { ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, request as proxyRequest, Server } from "node:http";
import { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { WorkflowsModule } from "../src/workflows/workflows.module";
import { ScenariosModule } from "../src/scenarios/scenarios.module";
import { PrepareOperationService } from "../src/scenarios/prepare-operation.service";
import { IntegrationBootstrapService } from "../src/integrations/integration-bootstrap.service";
import { IntegrationRegistry } from "../src/integrations/integration-registry.service";
import { IntegrationResolver } from "../src/integrations/integration-resolver.service";
import { createDemoOperationsAdapter } from "../src/integrations/demo/demo-operations.adapter";
import { BrowserClient } from "./browser-client";

describe("Portal authentication with PostgreSQL and Chrome", () => {
  const password = "portal-e2e-password";
  const userId = randomUUID();
  const companyA = randomUUID();
  const companyB = randomUUID();
  const companyForeign = randomUUID();
  const companies = [companyA, companyB, companyForeign];
  const email = `portal-${userId}@example.com`;
  const runIds = new Map<string, string>();
  const browser = new BrowserClient();
  let app: INestApplication | undefined;
  let prisma: PrismaService | undefined;
  let proxy: Server | undefined;
  let portal: ChildProcess | undefined;
  let portalLog = "";
  let delayCompany: string | undefined;
  let delayDetail = false;
  let baseUrl = "";
  let portalUrl = "";

  beforeAll(async () => {
    const database = new URL(process.env.PORTAL_TEST_DATABASE_URL ?? "http://missing.invalid");
    if (process.env.CI !== "true" || database.protocol !== "postgresql:" ||
      !["127.0.0.1", "localhost"].includes(database.hostname) || database.pathname !== "/plataforma_portal_ci" ||
      process.env.DATABASE_URL !== process.env.PORTAL_TEST_DATABASE_URL) {
      throw new Error("This suite requires an isolated local plataforma_portal_ci database in CI");
    }
    if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) throw new Error("Provider credentials must be absent");
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AuthModule, WorkflowsModule, ScenariosModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    prisma = app.get<PrismaService>(PrismaService);
    await prisma.company.createMany({ data: companies.map((id, index) => ({ id, name: `Portal QA ${index + 1}` })) });
    const passwords = moduleRef.get(PasswordService);
    await prisma.user.create({ data: { id: userId, name: "Portal QA", email, passwordHash: await passwords.hash(password) } });
    await prisma.companyUser.createMany({ data: [companyA, companyB].map((companyId) => ({ companyId, userId, role: "MEMBER" })) });
    for (const [index, companyId] of companies.entries()) {
      const run = await prisma.workflowRun.create({ data: {
        companyId, workflowKey: `portal.qa.${index + 1}`, operationId: randomUUID(), correlationId: randomUUID(),
        requestHash: "portal-qa-fixture", status: "COMPLETED", startedAt: new Date(), completedAt: new Date(),
        steps: { create: { companyId, stepKey: `qa_step_${index + 1}`, stepOrder: 1, status: "COMPLETED" } },
      } });
      runIds.set(companyId, run.id);
    }
    const managedId = runIds.get(companyA)!;
    const managedStep = await prisma.workflowStep.findFirstOrThrow({ where: { workflowRunId: managedId } });
    await prisma.workflowRun.update({ where: { id: managedId }, data: { status: "FAILED", error: "EXECUTION_INTERRUPTED" } });
    await prisma.workflowExecution.create({ data: {
      workflowRunId: managedId, companyId: companyA, requestedByUserId: userId, workflowVersion: "qa", simulated: true,
      state: "FAILED", attemptCount: 1, maxAttempts: 3, leaseMs: 60000,
    } });
    await prisma.workflowCheckpoint.create({ data: {
      workflowStepId: managedStep.id, workflowRunId: managedId, companyId: companyA,
      capabilityKey: "qa.action", integrationKind: "contracts", state: "UNKNOWN", replaySafety: "MANUAL", attemptCount: 1,
    } });
    await prisma.workflowIncident.create({ data: { workflowRunId: managedId, companyId: companyA, attemptNumber: 1, code: "EXECUTION_INTERRUPTED" } });
  });

  afterAll(async () => {
    await browser.close();
    if (portal) {
      portal.kill("SIGTERM");
      if (portal.exitCode === null) await Promise.race([new Promise<void>((complete) => portal!.once("exit", () => complete())), delay(2000, undefined, { ref: false })]);
      if (portal.exitCode === null) portal.kill("SIGKILL");
    }
    if (proxy) await new Promise<void>((complete) => proxy!.close(() => complete()));
    if (prisma) {
      await prisma.company.deleteMany({ where: { id: { in: companies } } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app?.close();
  });

  async function login() {
    const response = await request(app!.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
    expect(response.status).toBe(201);
    return response.body as { accessToken: string; refreshToken: string };
  }

  it("reads only persisted workflows belonging to the authenticated company", async () => {
    const tokens = await login();
    const response = await request(app!.getHttpServer()).get("/api/v1/workflows")
      .auth(tokens.accessToken, { type: "bearer" }).set("X-Company-Id", companyA);
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([runIds.get(companyA)]);
    const otherRun = await request(app!.getHttpServer()).get(`/api/v1/workflows/${runIds.get(companyB)}`)
      .auth(tokens.accessToken, { type: "bearer" }).set("X-Company-Id", companyA);
    expect(otherRun.status).toBe(404);
    const foreign = await request(app!.getHttpServer()).get("/api/v1/workflows")
      .auth(tokens.accessToken, { type: "bearer" }).set("X-Company-Id", companyForeign);
    expect(foreign.status).toBe(403);
  });

  it("atomically rotates a persisted session and rejects concurrent reuse", async () => {
    const tokens = await login();
    const responses = await Promise.all([1, 2].map(() => request(app!.getHttpServer())
      .post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken })));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 401]);
    const renewed = responses.find((response) => response.status === 201)!;
    expect(renewed.body.refreshToken).not.toBe(tokens.refreshToken);
    const logout = await request(app!.getHttpServer()).post("/api/v1/auth/logout").send({ refreshToken: renewed.body.refreshToken });
    expect(logout.status).toBe(201);
    const revoked = await request(app!.getHttpServer()).get("/api/v1/auth/me").auth(renewed.body.accessToken, { type: "bearer" });
    expect(revoked.status).toBe(401);
    expect(await prisma!.authSession.count({ where: { userId, revokedAt: { not: null } } })).toBeGreaterThan(0);
  });

  it("keeps the browser on the current tenant through delayed requests, expiration and logout", async () => {
    proxy = createServer(async (incoming, outgoing) => {
      const path = new URL(incoming.url ?? "/", baseUrl).pathname;
      if ((path === "/api/v1/workflows" && incoming.headers["x-company-id"] === delayCompany) ||
        (delayDetail && path.startsWith("/api/v1/workflows/"))) await delay(500);
      if (outgoing.destroyed) return;
      const upstream = proxyRequest(new URL(incoming.url ?? "/", baseUrl), {
        method: incoming.method, headers: incoming.headers,
      }, (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      });
      upstream.on("error", () => { if (!outgoing.destroyed) { outgoing.writeHead(502); outgoing.end(); } });
      incoming.pipe(upstream);
    });
    await new Promise<void>((complete) => proxy!.listen(0, "127.0.0.1", complete));
    const proxyPort = (proxy.address() as AddressInfo).port;
    const repository = resolve(__dirname, "../../..");
    const web = join(repository, "apps/web");
    const next = require.resolve("next/dist/bin/next", { paths: [web] });
    portalUrl = "http://127.0.0.1:3001";
    portal = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", "3001"], {
      cwd: web,
      env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_API_URL: `http://127.0.0.1:${proxyPort}/api/v1` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    portal.stdout!.on("data", (chunk) => { portalLog += String(chunk); });
    portal.stderr!.on("data", (chunk) => { portalLog += String(chunk); });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (portal.exitCode !== null) throw new Error(`Portal exited: ${portalLog}`);
      ready = await fetch(portalUrl).then((response) => response.ok).catch(() => false);
      if (ready) break;
      await delay(100);
    }
    if (!ready) throw new Error(`Portal unavailable: ${portalLog}`);
    await browser.start(portalUrl);
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await browser.waitFor('!!document.querySelector("input[type=email]")');
    if (process.env.PORTAL_QA_ARTIFACT_DIR) {
      await mkdir(process.env.PORTAL_QA_ARTIFACT_DIR, { recursive: true });
      const screenshot = await browser.capturePage();
      await writeFile(join(process.env.PORTAL_QA_ARTIFACT_DIR, "portal-login.png"), Buffer.from(screenshot.data, "base64"));
    }
    const submitLogin = async () => {
      await browser.evaluate(`(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        for (const [selector, value] of ${JSON.stringify([["input[type=email]", email], ["input[type=password]", password]])}) {
          const input = document.querySelector(selector);
          setter.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      })()`);
      await browser.evaluate('document.querySelector("button[type=submit]").click()');
      await browser.waitFor('!!document.querySelector("select[aria-label=Empresa]") && !document.querySelector("select[aria-label=Empresa]").disabled');
    };
    const selectCompany = (companyId: string) => browser.evaluate(`(() => {
      const select = document.querySelector("select[aria-label=Empresa]");
      select.value = ${JSON.stringify(companyId)};
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    const has = (text: string) => `document.body.innerText.includes(${JSON.stringify(text)})`;
    const clickRun = (text: string) => browser.evaluate(`Array.from(document.querySelectorAll("button.run-row")).find(button => button.innerText.includes(${JSON.stringify(text)})).click()`);
    await submitLogin();
    await selectCompany(companyA);
    await browser.waitFor(has("portal.qa.1"));
    const cookies = await browser.send<{ cookies: Array<{ name: string; httpOnly: boolean }> }>("Network.getCookies", { urls: [portalUrl] });
    expect(cookies.cookies.filter((cookie) => cookie.name.startsWith("plataforma_")).map((cookie) => cookie.httpOnly)).toEqual([true, true]);
    expect(await browser.evaluate<string>("document.cookie")).not.toContain("plataforma_");

    await clickRun("portal.qa.1");
    await browser.waitFor(`!!document.querySelector('section[aria-label="Integridade da execução"]')`);
    expect(await browser.evaluate<boolean>(has("Demonstração com adaptador simulado"))).toBe(true);
    expect(await browser.evaluate<boolean>(has("Resultado externo desconhecido"))).toBe(true);
    expect(await browser.evaluate<boolean>('Array.from(document.querySelectorAll("button")).some(button => button.textContent === "Retomar execução")')).toBe(false);
    await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Verificar interrupção").click()');
    await browser.waitFor('!Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Verificar interrupção").disabled');

    delayDetail = true;
    await clickRun("portal.qa.1");
    await browser.waitFor(has("Carregando execução…"));
    await selectCompany(companyB);
    await browser.waitFor(has("portal.qa.2"));
    await delay(700);
    expect(await browser.evaluate<boolean>(has("qa_step_1"))).toBe(false);
    expect(await browser.evaluate<boolean>(has("portal.qa.1"))).toBe(false);
    delayDetail = false;

    delayCompany = companyA;
    await selectCompany(companyA);
    await browser.waitFor(has("Carregando execuções…"));
    expect(await browser.evaluate<boolean>(has("portal.qa.2"))).toBe(false);
    await selectCompany(companyB);
    await browser.waitFor(has("portal.qa.2"));
    await delay(700);
    expect(await browser.evaluate<boolean>(has("portal.qa.1"))).toBe(false);
    delayCompany = undefined;
    await clickRun("portal.qa.2");
    await browser.waitFor(has("qa_step_2"));

    await prisma!.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Atualizar").click()');
    await browser.waitFor('!!document.querySelector("input[type=email]")');
    expect(await browser.evaluate<boolean>(has("portal.qa.2"))).toBe(false);
    await submitLogin();
    await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Sair").click()');
    await browser.waitFor('!!document.querySelector("input[type=email]")');
    await browser.send("Page.reload");
    await browser.waitFor('!!document.querySelector("input[type=email]")');
    expect(await browser.evaluate<boolean>(has("portal.qa.1"))).toBe(false);
    expect(await browser.evaluate<boolean>(has("portal.qa.2"))).toBe(false);
  });

  it("resumes a persisted failed scenario through the portal without repeating its completed read", async () => {
    const sessionId = randomUUID();
    await prisma!.authSession.create({ data: { id: sessionId, userId, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    await app!.get(IntegrationBootstrapService).enableDemoIntegrationsForCompany(companyA);
    const demo = createDemoOperationsAdapter();
    let attempts = 0;
    app!.get(IntegrationRegistry).registerOperations({ ...demo, key: "qa-portal-recovery", plan: async (company, input) => {
      if (++attempts === 1) throw new Error("isolated recovery fixture");
      return { ...await demo.plan(company, input), sourceAdapter: "qa-portal-recovery" };
    } });
    await app!.get(IntegrationResolver).replaceBinding({ companyId: companyA, kind: "operations", adapterKey: "qa-portal-recovery" });
    const failed = await app!.get(PrepareOperationService).run({ companyId: companyA, userId, sessionId }, { contractExternalRef: "ATLAS", operationId: randomUUID() });
    expect(failed).toMatchObject({ success: false, error: "EXECUTION_FAILED" });
    const completedRead = await prisma!.workflowCheckpoint.findFirstOrThrow({ where: { workflowRunId: failed.workflowRunId, capabilityKey: "contracts.read" } });
    expect(completedRead).toMatchObject({ state: "COMPLETED", attemptCount: 1 });
    expect(await browser.evaluate(`fetch("/api/session/login", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(${JSON.stringify({ email, password })})}).then(response=>response.ok)`)).toBe(true);
    await browser.send("Page.reload");
    await browser.waitFor('!!document.querySelector("select[aria-label=Empresa]")');
    await browser.evaluate(`(() => { const select=document.querySelector("select[aria-label=Empresa]"); select.value=${JSON.stringify(companyA)}; select.dispatchEvent(new Event("change",{bubbles:true})); })()`);
    await browser.waitFor(`!!document.querySelector('button[data-workflow-key="operations.prepare_from_contract"]')`);
    await browser.evaluate(`document.querySelector('button[data-workflow-key="operations.prepare_from_contract"]').click()`);
    await browser.waitFor('!!Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Retomar execução")');
    await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Retomar execução").click()');
    await browser.waitFor('!!document.querySelector(".detail-heading .status-completed")');
    expect(attempts).toBe(2);
    expect(await prisma!.workflowCheckpoint.findUnique({ where: { workflowStepId: completedRead.workflowStepId } })).toMatchObject({ state: "COMPLETED", attemptCount: 1 });
    expect(await browser.evaluate<boolean>('document.body.innerText.includes("Demonstração com adaptador simulado")')).toBe(true);
    expect(await browser.evaluate<boolean>('document.body.innerText.includes("Resolvido")')).toBe(true);
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await browser.waitFor('window.innerWidth === 390');
    expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
  });

  it("shows the empty account without invented visible identities or business records", async () => {
    await prisma!.companyUser.updateMany({ where: { userId }, data: { status: "INACTIVE" } });
    await prisma!.user.update({ where: { id: userId }, data: { name: "" } });
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await browser.send("Page.reload");
    await browser.waitFor('document.querySelector(".topbar h1")?.textContent === "Sem empresa ativa"');
    expect(await browser.evaluate<number>('document.querySelectorAll("button.run-row").length')).toBe(0);
    expect(await browser.evaluate<boolean>('document.body.innerText.includes("Portal QA") || document.body.innerText.includes("portal.qa")')).toBe(false);
    expect(await browser.evaluate<boolean>('!!document.querySelector(".user-name")')).toBe(false);
    expect(await browser.evaluate<boolean>(`document.querySelector('select[aria-label="Filtrar por status"]').disabled`)).toBe(true);
    if (process.env.PORTAL_QA_ARTIFACT_DIR) {
      const desktop = await browser.capturePage();
      await writeFile(join(process.env.PORTAL_QA_ARTIFACT_DIR, "portal-empty-desktop.png"), Buffer.from(desktop.data, "base64"));
    }
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await browser.waitFor('window.innerWidth === 390');
    expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    if (process.env.PORTAL_QA_ARTIFACT_DIR) {
      const mobile = await browser.capturePage();
      await writeFile(join(process.env.PORTAL_QA_ARTIFACT_DIR, "portal-empty-mobile.png"), Buffer.from(mobile.data, "base64"));
    }
    await browser.evaluate('Array.from(document.querySelectorAll("button.nav-item")).find(button => button.textContent.trim() === "Aprovações").click()');
    await browser.waitFor('!!document.querySelector("#aprovacoes .empty-state")');
    expect(await browser.evaluate<number>('document.querySelectorAll("article[data-approval-id]").length')).toBe(0);
    expect(await browser.evaluate<boolean>('document.querySelector("#aprovacoes").innerText.includes("Nenhuma empresa ativa")')).toBe(true);
    expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    if (process.env.PORTAL_QA_ARTIFACT_DIR) {
      const mobile = await browser.capturePage();
      await writeFile(join(process.env.PORTAL_QA_ARTIFACT_DIR, "approvals-empty-mobile.png"), Buffer.from(mobile.data, "base64"));
    }
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await browser.waitFor('window.innerWidth === 1280');
    if (process.env.PORTAL_QA_ARTIFACT_DIR) {
      const desktop = await browser.capturePage();
      await writeFile(join(process.env.PORTAL_QA_ARTIFACT_DIR, "approvals-empty-desktop.png"), Buffer.from(desktop.data, "base64"));
    }
  });
});
