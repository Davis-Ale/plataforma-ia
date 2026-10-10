import { PrismaService } from "@plataforma/database";
import { AiUsageAttempt } from "@prisma/client";
import { AiMeteringService } from "./ai-metering.service";

describe("Backend settlement of an existing reservation", () => {
  const owner = { companyId: "a", userId: "original-user" };
  const report = { reservationId: "reservation", status: "COMPLETED" as const,
    inputTokens: 20, outputTokens: 5, actualCostMicros: 100, latencyMs: 30 };
  let attempt: AiUsageAttempt;
  let service: AiMeteringService;
  let membership: jest.Mock;
  let lock: jest.Mock;
  let find: jest.Mock;
  let update: jest.Mock;
  let budget: jest.Mock;
  let audit: jest.Mock;

  beforeEach(() => {
    attempt = { id: "reservation", companyId: "a", userId: "original-user", budgetId: "original-budget",
      operationId: "original-operation", attemptNumber: 1, requestHash: "original-hash", settlementHash: null,
      correlationId: "trace", modelClass: "ECONOMY", logicalModel: "logical", capabilityKey: "example.read",
      workflowRunId: null, workflowStepId: null, status: "RESERVED", maxInputTokens: 40n, maxOutputTokens: 10n,
      reservedCostMicros: 400n, estimatedCostMicros: null, inputTokens: null, outputTokens: null,
      actualCostMicros: null, chargedTokens: null, chargedCostMicros: null, latencyMs: null,
      completedAt: null, createdAt: new Date() };
    membership = jest.fn().mockResolvedValue(null);
    lock = jest.fn().mockResolvedValue([{ id: "a" }]);
    find = jest.fn().mockImplementation(async ({ where }) => Object.entries(where)
      .every(([key, value]) => attempt[key as keyof AiUsageAttempt] === value) ? { ...attempt } : null);
    update = jest.fn().mockImplementation(async ({ data }) => { attempt = { ...attempt, ...data }; return { ...attempt }; });
    budget = jest.fn().mockResolvedValue({ currency: "USD" });
    audit = jest.fn().mockResolvedValue({});
    const tx = { $queryRaw: lock, companyUser: { findFirst: membership },
      aiUsageAttempt: { findFirst: find, update }, aiBudgetPolicy: { update: budget }, auditLog: { create: audit } };
    service = new AiMeteringService({ $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService);
  });

  it.each([undefined, "expired-session", "revoked-session"])("settles without relying on session %s and preserves the original reservation", async (sessionId) => {
    const context = { ...owner, sessionId };
    expect(await service.settle(context, report)).toEqual({ recorded: true, replay: false, exceededReservation: false });
    expect(membership).not.toHaveBeenCalled();
    expect(lock.mock.calls[0][0].join("?")).not.toContain("status");
    expect(find).toHaveBeenCalledWith({ where: { id: "reservation", ...owner } });
    expect(attempt).toMatchObject({ ...owner, budgetId: "original-budget", operationId: "original-operation",
      attemptNumber: 1, requestHash: "original-hash", status: "COMPLETED", inputTokens: 20n,
      outputTokens: 5n, chargedCostMicros: 100n });
    expect(budget).toHaveBeenCalledWith({ where: { id_companyId: { id: "original-budget", companyId: "a" } },
      data: { reservedTokens: { decrement: 50n }, reservedCostMicros: { decrement: 400n },
        spentTokens: { increment: 25n }, spentCostMicros: { increment: 100n }, activeReservations: { decrement: 1 } } });
    expect(audit.mock.calls[0][0].data).toMatchObject(owner);
  });

  it("does not grant authorization for a new reservation after settling", async () => {
    await service.settle(owner, report);
    expect(await service.reserve({ ...owner, sessionId: "revoked-session" }, {
      operationId: "new-operation", attemptNumber: 1, correlationId: "trace", modelClass: "ECONOMY",
      logicalModel: "logical", capabilityKey: "example.read", currency: "USD",
      maxInputTokens: 40, maxOutputTokens: 10, costCapMicros: 400,
    })).toEqual({ allowed: false, reason: "DENIED" });
    expect(membership).toHaveBeenCalledTimes(1);
  });

  it("keeps settlement idempotent and denies conflicting reports", async () => {
    expect(await service.settle(owner, report)).toMatchObject({ recorded: true, replay: false });
    expect(await service.settle(owner, report)).toMatchObject({ recorded: true, replay: true });
    expect(await service.settle(owner, { ...report, actualCostMicros: 101 })).toEqual({ recorded: false, reason: "IDEMPOTENCY_CONFLICT" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(budget).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it.each([{ companyId: "b", userId: "original-user" }, { companyId: "a", userId: "other-user" },
    { companyId: "", userId: "original-user" }])("rejects a different or absent reservation owner: %j", async (context) => {
    expect(await service.settle(context, report)).toEqual({ recorded: false, reason: "DENIED" });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not create a reservation during settlement or settle a missing one", async () => {
    expect(await service.settle(owner, { ...report, reservationId: "unknown" })).toEqual({ recorded: false, reason: "DENIED" });
    expect(update).not.toHaveBeenCalled();
    expect(budget).not.toHaveBeenCalled();
  });
});
