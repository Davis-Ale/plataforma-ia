import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaService } from "@plataforma/database";
import { CapabilityContext } from "../capabilities/capability.types";
import { AiMeteringService } from "./ai-metering.service";
import { BudgetPolicyInput, ReservationResult, ReserveAiUsageInput } from "./ai-metering.types";

jest.setTimeout(20000);

describe("AI Metering + Budget Policy PostgreSQL", () => {
  const prisma = new PrismaService();
  const replicaPrisma = new PrismaService();
  const service = new AiMeteringService(prisma);
  const replica = new AiMeteringService(replicaPrisma);
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const context: CapabilityContext = { companyId, userId: randomUUID(), sessionId: randomUUID() };
  const member: CapabilityContext = { companyId, userId: randomUUID(), sessionId: randomUUID() };
  const other = { ...context, companyId: otherCompanyId };
  const policy: BudgetPolicyInput = {
    periodKey: "test-window", periodStart: new Date(Date.now() - 60000),
    periodEnd: new Date(Date.now() + 3600000), currency: "USD", enabled: true,
    tokenLimit: 100, costLimitMicros: 1000, maxConcurrent: 2,
  };
  const request = (overrides: Partial<ReserveAiUsageInput> = {}): ReserveAiUsageInput => ({
    operationId: randomUUID(), attemptNumber: 1, correlationId: randomUUID(),
    modelClass: "standard", logicalModel: "generic.text", capabilityKey: "example.analyze",
    currency: "USD", maxInputTokens: 40, maxOutputTokens: 10, costCapMicros: 400,
    estimatedCostMicros: 250, ...overrides,
  });

  async function reserve(input = request()) {
    const result = await service.reserve(context, input);
    if (!result.allowed) throw new Error(`Unexpected reservation denial: ${result.reason}`);
    return result.reservationId;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      const env = readFileSync(resolve(__dirname, "../../../../.env"), "utf8");
      const value = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
      if (!value) throw new Error("DATABASE_URL is required");
      process.env.DATABASE_URL = value.replace(/^["']|["']$/g, "");
    }
    await prisma.$connect();
    await replicaPrisma.$connect();
    await prisma.company.createMany({ data: [
      { id: companyId, name: "ai-metering-test" }, { id: otherCompanyId, name: "ai-metering-other-test" },
    ] });
    for (const [actor, role] of [[context, "ADMIN"], [member, "MEMBER"]] as const) {
      await prisma.user.create({ data: {
        id: actor.userId, name: "metering-test-actor", email: `${actor.userId}@example.test`,
        companies: { create: role === "ADMIN" ? [{ companyId, role }, { companyId: otherCompanyId, role }] : [{ companyId, role }] },
        sessions: { create: { id: actor.sessionId, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } },
      } });
    }
  });

  beforeEach(async () => {
    await prisma.aiBudgetPolicy.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    expect(await service.configureBudget(context, policy)).toEqual(expect.objectContaining({ configured: true }));
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    try {
      await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [context.userId, member.userId] } } });
    } finally {
      await prisma.$disconnect();
      await replicaPrisma.$disconnect();
    }
  });

  it("denies absent, disabled, expired and wrong-currency budgets", async () => {
    expect(await service.reserve(other, request())).toEqual({ allowed: false, reason: "BUDGET_UNAVAILABLE" });
    await service.configureBudget(context, { ...policy, enabled: false });
    expect(await service.reserve(context, request())).toEqual({ allowed: false, reason: "BUDGET_UNAVAILABLE" });
    await service.configureBudget(context, policy);
    expect(await service.reserve(context, request({ currency: "BRL" }))).toEqual({ allowed: false, reason: "BUDGET_UNAVAILABLE" });
    await prisma.aiBudgetPolicy.deleteMany({ where: { companyId } });
    await service.configureBudget(context, {
      ...policy, periodStart: new Date(Date.now() - 120000), periodEnd: new Date(Date.now() - 60000),
    });
    expect(await service.reserve(context, request())).toEqual({ allowed: false, reason: "BUDGET_UNAVAILABLE" });
  });

  it("reserves upper bounds atomically across independent clients", async () => {
    const results = await Promise.all([
      service.reserve(context, request()), replica.reserve(context, request()), service.reserve(context, request()),
    ]);
    expect(results.filter((result) => result.allowed)).toHaveLength(2);
    expect(results.filter((result) => !result.allowed)).toEqual([{ allowed: false, reason: "BUDGET_EXCEEDED" }]);
    const budget = await prisma.aiBudgetPolicy.findFirstOrThrow({ where: { companyId } });
    expect(budget.reservedTokens).toBe(100n);
    expect(budget.reservedCostMicros).toBe(800n);
    expect(budget.activeReservations).toBe(2);
  });

  it("blocks a cost overflow independently of token and concurrency limits", async () => {
    await service.configureBudget(context, { ...policy, costLimitMicros: 300 });
    expect(await service.reserve(context, request())).toEqual({ allowed: false, reason: "BUDGET_EXCEEDED" });
    expect(await prisma.aiUsageAttempt.count({ where: { companyId } })).toBe(0);
  });

  it("enforces a concurrent execution cap and releases it after settlement", async () => {
    await service.configureBudget(context, { ...policy, maxConcurrent: 1 });
    const results = await Promise.all([service.reserve(context, request()), replica.reserve(context, request())]);
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toEqual([{ allowed: false, reason: "CONCURRENCY_LIMIT" }]);
    const accepted = results.find((result): result is Extract<ReservationResult, { allowed: true }> => result.allowed)!;
    await service.settle(context, { reservationId: accepted.reservationId, status: "COMPLETED", inputTokens: 10, outputTokens: 5, actualCostMicros: 100, latencyMs: 20 });
    expect(await service.reserve(context, request())).toEqual(expect.objectContaining({ allowed: true }));
  });

  it("accounts one reservation and one settlement under concurrent reprocessing", async () => {
    const input = request();
    const results = await Promise.all([service.reserve(context, input), replica.reserve(context, input)]);
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toEqual([{ allowed: false, reason: "DUPLICATE_ATTEMPT" }]);
    const accepted = results.find((result): result is Extract<ReservationResult, { allowed: true }> => result.allowed)!;
    const report = { reservationId: accepted.reservationId, status: "COMPLETED" as const, inputTokens: 20, outputTokens: 10, actualCostMicros: 200, latencyMs: 35 };
    const settlements = await Promise.all([service.settle(context, report), replica.settle(context, report)]);
    expect(settlements).toEqual(expect.arrayContaining([
      { recorded: true, replay: false, exceededReservation: false }, { recorded: true, replay: true, exceededReservation: false },
    ]));
    const budget = await prisma.aiBudgetPolicy.findFirstOrThrow({ where: { companyId } });
    expect(budget).toEqual(expect.objectContaining({ spentTokens: 30n, spentCostMicros: 200n, reservedTokens: 0n, reservedCostMicros: 0n, activeReservations: 0 }));
    expect(await prisma.auditLog.count({ where: { companyId, resource: "ai_metering", resourceId: accepted.reservationId, action: "UPDATE" } })).toBe(1);
    expect(await service.reserve(context, input)).toEqual({ allowed: false, reason: "DUPLICATE_ATTEMPT" });
    expect(await service.settle(context, { ...report, actualCostMicros: 201 })).toEqual({ recorded: false, reason: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps previous-period reservations in tenant concurrency and settles their original budget", async () => {
    const reservationId = await reserve();
    const endedAt = new Date(Date.now() - 1000);
    await prisma.aiBudgetPolicy.updateMany({ where: { companyId }, data: { periodEnd: endedAt } });
    const next = { ...policy, periodKey: "next-window", periodStart: new Date(endedAt.getTime() + 1), maxConcurrent: 1 };
    expect(await service.configureBudget(context, next)).toEqual(expect.objectContaining({ configured: true }));
    expect(await service.reserve(context, request())).toEqual({ allowed: false, reason: "CONCURRENCY_LIMIT" });
    await service.settle(context, { reservationId, status: "COMPLETED", inputTokens: 10, outputTokens: 5, actualCostMicros: 50, latencyMs: 10 });
    expect(await service.reserve(context, request())).toEqual(expect.objectContaining({ allowed: true }));
    const budgets = await prisma.aiBudgetPolicy.findMany({ where: { companyId } });
    expect(budgets.find((budget) => budget.periodKey === policy.periodKey)).toEqual(expect.objectContaining({ spentTokens: 15n, reservedTokens: 0n }));
    expect(budgets.find((budget) => budget.periodKey === next.periodKey)).toEqual(expect.objectContaining({ spentTokens: 0n, reservedTokens: 50n }));
  });

  it("charges unknown cost conservatively while preserving known token usage", async () => {
    const reservationId = await reserve();
    await service.settle(context, { reservationId, status: "COMPLETED", inputTokens: 20, outputTokens: 10, latencyMs: 1 });
    expect(await prisma.aiUsageAttempt.findFirst({ where: { companyId, id: reservationId } }))
      .toEqual(expect.objectContaining({ inputTokens: 20n, outputTokens: 10n, chargedTokens: 30n, actualCostMicros: null, chargedCostMicros: 400n }));
  });

  it("rejects conflicting attempts and requires the previous retry to be finalized", async () => {
    const input = request();
    const reservationId = await reserve(input);
    expect(await service.reserve(context, { ...input, costCapMicros: 401 })).toEqual({ allowed: false, reason: "IDEMPOTENCY_CONFLICT" });
    expect(await service.reserve(context, { ...input, attemptNumber: 2 })).toEqual({ allowed: false, reason: "DENIED" });
    expect(await service.settle(context, { reservationId, status: "FAILED", latencyMs: 50 })).toEqual({ recorded: true, replay: false, exceededReservation: false });
    expect(await service.reserve(context, { ...input, attemptNumber: 2 })).toEqual(expect.objectContaining({ allowed: true }));
    const attempts = await prisma.aiUsageAttempt.findMany({ where: { companyId, operationId: input.operationId }, orderBy: { attemptNumber: "asc" } });
    expect(attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
    expect(attempts[0]).toEqual(expect.objectContaining({ inputTokens: null, actualCostMicros: null, chargedTokens: 50n, chargedCostMicros: 400n }));
  });

  it("persists actual overages and blocks further reservations", async () => {
    const reservationId = await reserve();
    expect(await service.settle(context, { reservationId, status: "COMPLETED", inputTokens: 150, outputTokens: 10, actualCostMicros: 1100, latencyMs: 25 }))
      .toEqual({ recorded: true, replay: false, exceededReservation: true });
    const budget = await prisma.aiBudgetPolicy.findFirstOrThrow({ where: { companyId } });
    expect(budget.spentTokens).toBe(160n);
    expect(budget.spentCostMicros).toBe(1100n);
    expect(await service.reserve(context, request())).toEqual({ allowed: false, reason: "BUDGET_EXCEEDED" });
  });

  it("preserves tenant and actor isolation when settling and linking workflows", async () => {
    const reservationId = await reserve();
    const report = { reservationId, status: "COMPLETED" as const, latencyMs: 1 };
    expect(await service.settle(other, report)).toEqual({ recorded: false, reason: "DENIED" });
    expect(await service.settle(member, report)).toEqual({ recorded: false, reason: "DENIED" });
    const run = await prisma.workflowRun.create({ data: { companyId: otherCompanyId, workflowKey: "test-metering" } });
    expect(await service.reserve(context, request({ workflowRunId: run.id }))).toEqual({ allowed: false, reason: "DENIED" });
    expect(await prisma.aiUsageAttempt.findFirst({ where: { companyId, id: reservationId } })).toEqual(expect.objectContaining({ status: "RESERVED" }));
  });

  it("isolates budget balances and attempt identities across tenants", async () => {
    expect(await service.configureBudget(other, policy)).toEqual(expect.objectContaining({ configured: true }));
    const input = request();
    const results = await Promise.all([service.reserve(context, input), replica.reserve(other, input)]);
    expect(results.every((result) => result.allowed)).toBe(true);
    expect(await prisma.aiUsageAttempt.count({ where: { operationId: input.operationId, companyId: { in: [companyId, otherCompanyId] } } })).toBe(2);
    const budgets = await prisma.aiBudgetPolicy.findMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    expect(budgets.map((budget) => budget.reservedTokens)).toEqual([50n, 50n]);
  });

  it("restricts configuration to active administrators and prevents overlap or counter reset", async () => {
    expect(await service.configureBudget(member, policy)).toEqual({ configured: false, reason: "DENIED" });
    expect(await service.configureBudget(context, { ...policy, periodKey: "overlap" })).toEqual({ configured: false, reason: "DENIED" });
    await reserve();
    expect(await service.configureBudget(context, { ...policy, tokenLimit: 49 })).toEqual({ configured: false, reason: "DENIED" });
    expect(await service.configureBudget(context, { ...policy, periodEnd: new Date(policy.periodEnd.getTime() + 1000) })).toEqual({ configured: false, reason: "DENIED" });
    expect(await service.configureBudget(context, { ...policy, tokenLimit: 200 })).toEqual(expect.objectContaining({ configured: true }));
    expect(await prisma.aiBudgetPolicy.findFirst({ where: { companyId } })).toEqual(expect.objectContaining({ reservedTokens: 50n }));
  });

  it("revalidates session revocation and denies without changing counters", async () => {
    await prisma.authSession.update({ where: { id: member.sessionId }, data: { revokedAt: new Date() } });
    try {
      expect(await service.reserve(member, request())).toEqual({ allowed: false, reason: "DENIED" });
      expect(await prisma.aiUsageAttempt.count({ where: { companyId } })).toBe(0);
    } finally {
      await prisma.authSession.update({ where: { id: member.sessionId }, data: { revokedAt: null } });
    }
  });

  it("integrates safe latency and correlation observations transactionally", async () => {
    const input = request();
    const reservationId = await reserve(input);
    await service.settle(context, { reservationId, status: "FAILED", latencyMs: 123 });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { companyId, resourceId: reservationId, action: "UPDATE" } });
    expect(log.metadata).toEqual(expect.objectContaining({
      operationId: input.operationId, attemptNumber: 1, modelClass: "standard", logicalModel: "generic.text", currency: "USD",
      estimatedCostMicros: "250", actualCostMicros: null, chargedCostMicros: "400",
      observation: expect.objectContaining({ correlationId: input.correlationId, capabilityKey: input.capabilityKey, durationMs: 123, result: "FAILURE", errorCode: "EXECUTION_FAILED" }),
    }));
  });

  it("rolls back reservations and settlement when audit persistence fails", async () => {
    const transaction = prisma.$transaction.bind(prisma);
    const spy = jest.spyOn(prisma, "$transaction").mockImplementation((async (callback: (tx: unknown) => Promise<unknown>) => {
      return transaction(async (tx) => {
        jest.spyOn(tx.auditLog, "create").mockRejectedValueOnce(new Error("unavailable"));
        return callback(tx);
      });
    }) as typeof prisma.$transaction);
    expect(await service.configureBudget(context, { ...policy, enabled: false }))
      .toEqual({ configured: false, reason: "METERING_UNAVAILABLE" });
    expect(await prisma.aiBudgetPolicy.findFirst({ where: { companyId } })).toEqual(expect.objectContaining({ enabled: true }));
    expect(await service.reserve(context, request())).toEqual({ allowed: false, reason: "METERING_UNAVAILABLE" });
    expect(await prisma.aiUsageAttempt.count({ where: { companyId } })).toBe(0);
    expect(await prisma.aiBudgetPolicy.findFirst({ where: { companyId } })).toEqual(expect.objectContaining({ reservedTokens: 0n, activeReservations: 0 }));
    spy.mockRestore();
    const reservationId = await reserve();
    jest.spyOn(prisma, "$transaction").mockImplementation((async (callback: (tx: unknown) => Promise<unknown>) => {
      return transaction(async (tx) => {
        jest.spyOn(tx.auditLog, "create").mockRejectedValueOnce(new Error("unavailable"));
        return callback(tx);
      });
    }) as typeof prisma.$transaction);
    expect(await service.settle(context, { reservationId, status: "COMPLETED", latencyMs: 1 }))
      .toEqual({ recorded: false, reason: "METERING_UNAVAILABLE" });
    expect(await prisma.aiUsageAttempt.findFirst({ where: { companyId, id: reservationId } })).toEqual(expect.objectContaining({ status: "RESERVED" }));
    expect(await prisma.aiBudgetPolicy.findFirst({ where: { companyId } })).toEqual(expect.objectContaining({ reservedTokens: 50n, spentTokens: 0n, activeReservations: 1 }));
  });

  it("fails closed when metering storage is unavailable", async () => {
    jest.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("private diagnostic"));
    expect(await service.reserve(context, request())).toEqual({ allowed: false, reason: "METERING_UNAVAILABLE" });
  });

  it("rejects partial or invalid settlement usage without releasing the reservation", async () => {
    const reservationId = await reserve();
    for (const invalid of [{ inputTokens: 10 }, { actualCostMicros: -1 }, { latencyMs: NaN }]) {
      expect(await service.settle(context, { reservationId, status: "COMPLETED", latencyMs: 1, ...invalid }))
        .toEqual({ recorded: false, reason: "INVALID_INPUT" });
    }
    expect(await prisma.aiBudgetPolicy.findFirst({ where: { companyId } })).toEqual(expect.objectContaining({ reservedTokens: 50n, activeReservations: 1 }));
  });

  it.each([
    { maxInputTokens: -1 }, { maxOutputTokens: 1.2 }, { costCapMicros: 0 },
    { estimatedCostMicros: 401 }, { maxInputTokens: Number.MAX_SAFE_INTEGER },
    { attemptNumber: 0 }, { correlationId: " " }, { currency: "" }, { workflowStepId: "unbound" },
  ])("rejects invalid usage bounds before storage: %j", async (invalid) => {
    expect(await service.reserve(context, request(invalid))).toEqual({ allowed: false, reason: "INVALID_INPUT" });
    expect(await prisma.aiUsageAttempt.count({ where: { companyId } })).toBe(0);
  });
});
