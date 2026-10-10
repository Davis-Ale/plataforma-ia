import { Injectable } from "@nestjs/common";
import { AiUsageAttempt, Prisma } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { createHash } from "node:crypto";
import { CapabilityContext } from "../capabilities/capability.types";
import { buildProcessObservation } from "../observability/process-observation";
import {
  BudgetPolicyInput, BudgetPolicyResult, MeteringDenial, ReservationResult, ReserveAiUsageInput,
  AiSettlementContext, SettleAiUsageInput, SettlementResult,
} from "./ai-metering.types";

@Injectable()
export class AiMeteringService {
  constructor(private readonly prisma: PrismaService) {}

  async configureBudget(context: CapabilityContext, input: BudgetPolicyInput): Promise<BudgetPolicyResult> {
    context = this.contextSnapshot(context);
    if (!this.validContext(context)) return { configured: false, reason: "DENIED" } as const;
    if (!input || !this.identifier(input.periodKey) || !/^[A-Z]{3}$/.test(input.currency) ||
      typeof input.enabled !== "boolean" || !this.amount(input.tokenLimit) ||
      !this.amount(input.costLimitMicros) || !this.amount(input.maxConcurrent, 2147483647) ||
      input.maxConcurrent < 1 || !(input.periodStart instanceof Date) ||
      !(input.periodEnd instanceof Date) || !Number.isFinite(input.periodStart.getTime()) ||
      !Number.isFinite(input.periodEnd.getTime()) || input.periodEnd <= input.periodStart) {
      return { configured: false, reason: "INVALID_INPUT" } as const;
    }
    const policy = {
      periodKey: input.periodKey, periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd), currency: input.currency, enabled: input.enabled,
      tokenLimit: BigInt(input.tokenLimit), costLimitMicros: BigInt(input.costLimitMicros),
      maxConcurrent: input.maxConcurrent,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!await this.lockAndAuthorize(tx, context, true)) {
          return { configured: false, reason: "DENIED" } as const;
        }
        const existing = await tx.aiBudgetPolicy.findUnique({
          where: { companyId_periodKey: { companyId: context.companyId, periodKey: policy.periodKey } },
        });
        if (existing && (
          existing.periodStart.getTime() !== policy.periodStart.getTime() ||
          existing.periodEnd.getTime() !== policy.periodEnd.getTime() || existing.currency !== policy.currency ||
          policy.tokenLimit < existing.spentTokens + existing.reservedTokens ||
          policy.costLimitMicros < existing.spentCostMicros + existing.reservedCostMicros ||
          policy.maxConcurrent < existing.activeReservations
        )) return { configured: false, reason: "DENIED" } as const;
        if (await tx.aiBudgetPolicy.findFirst({
          where: {
            companyId: context.companyId, periodKey: { not: policy.periodKey },
            periodStart: { lt: policy.periodEnd }, periodEnd: { gt: policy.periodStart },
          }, select: { id: true },
        })) return { configured: false, reason: "DENIED" } as const;
        const budget = await tx.aiBudgetPolicy.upsert({
          where: { companyId_periodKey: { companyId: context.companyId, periodKey: policy.periodKey } },
          create: { companyId: context.companyId, ...policy }, update: policy,
        });
        await tx.auditLog.create({ data: {
          companyId: context.companyId, userId: context.userId,
          action: existing ? "UPDATE" : "CREATE", resource: "ai_budget_policy", resourceId: budget.id,
          metadata: {
            periodKey: policy.periodKey, periodStart: policy.periodStart.toISOString(),
            periodEnd: policy.periodEnd.toISOString(), currency: policy.currency, enabled: policy.enabled,
            tokenLimit: policy.tokenLimit.toString(), costLimitMicros: policy.costLimitMicros.toString(),
            maxConcurrent: policy.maxConcurrent,
          },
        } });
        return { configured: true, budgetId: budget.id } as const;
      }, { maxWait: 5000, timeout: 10000 });
    } catch {
      return { configured: false, reason: "METERING_UNAVAILABLE" } as const;
    }
  }

  async reserve(context: CapabilityContext, input: ReserveAiUsageInput): Promise<ReservationResult> {
    context = this.contextSnapshot(context);
    if (!this.validContext(context)) return { allowed: false, reason: "DENIED" };
    if (!this.validReservation(input)) return { allowed: false, reason: "INVALID_INPUT" };
    const request = {
      operationId: input.operationId, attemptNumber: input.attemptNumber,
      correlationId: input.correlationId, modelClass: input.modelClass, logicalModel: input.logicalModel,
      capabilityKey: input.capabilityKey, workflowRunId: input.workflowRunId, workflowStepId: input.workflowStepId,
      currency: input.currency, maxInputTokens: input.maxInputTokens, maxOutputTokens: input.maxOutputTokens,
      costCapMicros: input.costCapMicros, estimatedCostMicros: input.estimatedCostMicros,
    };
    const requestHash = this.hash(request);
    try {
      return await this.prisma.$transaction(async (tx): Promise<ReservationResult> => {
        if (!await this.lockAndAuthorize(tx, context)) return { allowed: false, reason: "DENIED" };
        const deny = async (reason: MeteringDenial): Promise<ReservationResult> => {
          const now = new Date();
          await tx.auditLog.create({ data: {
            companyId: context.companyId, userId: context.userId, action: "CREATE", resource: "ai_metering",
            metadata: {
              reason, operationId: request.operationId, attemptNumber: request.attemptNumber,
              observation: buildProcessObservation({
                companyId: context.companyId, correlationId: request.correlationId,
                operation: "ai.usage.reserve", capabilityKey: request.capabilityKey,
                startedAt: now, completedAt: now, result: "DENIED", errorCode: "DENIED",
              }),
            },
          } });
          return { allowed: false, reason };
        };
        const duplicate = await tx.aiUsageAttempt.findUnique({ where: {
          companyId_operationId_attemptNumber: {
            companyId: context.companyId, operationId: request.operationId, attemptNumber: request.attemptNumber,
          },
        } });
        if (duplicate) return deny(duplicate.requestHash === requestHash && duplicate.userId === context.userId
          ? "DUPLICATE_ATTEMPT" : "IDEMPOTENCY_CONFLICT");
        if (request.attemptNumber > 1) {
          const previous = await tx.aiUsageAttempt.findUnique({ where: {
            companyId_operationId_attemptNumber: {
              companyId: context.companyId, operationId: request.operationId, attemptNumber: request.attemptNumber - 1,
            },
          } });
          if (!previous || previous.userId !== context.userId || previous.status === "RESERVED") return deny("DENIED");
        }
        if (request.workflowRunId && !await tx.workflowRun.findFirst({
          where: { id: request.workflowRunId, companyId: context.companyId }, select: { id: true },
        })) return deny("DENIED");
        if (request.workflowStepId && !await tx.workflowStep.findFirst({
          where: { id: request.workflowStepId, workflowRunId: request.workflowRunId, companyId: context.companyId },
          select: { id: true },
        })) return deny("DENIED");
        const now = new Date();
        const budget = await tx.aiBudgetPolicy.findFirst({ where: {
          companyId: context.companyId, enabled: true, periodStart: { lte: now }, periodEnd: { gt: now },
        } });
        if (!budget || budget.currency !== request.currency) return deny("BUDGET_UNAVAILABLE");
        const tokens = BigInt(request.maxInputTokens) + BigInt(request.maxOutputTokens);
        const cost = BigInt(request.costCapMicros);
        if (budget.spentTokens + budget.reservedTokens + tokens > budget.tokenLimit ||
          budget.spentCostMicros + budget.reservedCostMicros + cost > budget.costLimitMicros) {
          return deny("BUDGET_EXCEEDED");
        }
        const concurrent = await tx.aiBudgetPolicy.aggregate({
          where: { companyId: context.companyId }, _sum: { activeReservations: true },
        });
        if ((concurrent._sum.activeReservations ?? 0) >= budget.maxConcurrent) return deny("CONCURRENCY_LIMIT");
        const attempt = await tx.aiUsageAttempt.create({ data: {
          companyId: context.companyId, userId: context.userId, budgetId: budget.id,
          operationId: request.operationId, attemptNumber: request.attemptNumber, requestHash,
          correlationId: request.correlationId, modelClass: request.modelClass, logicalModel: request.logicalModel,
          capabilityKey: request.capabilityKey, workflowRunId: request.workflowRunId, workflowStepId: request.workflowStepId,
          maxInputTokens: BigInt(request.maxInputTokens), maxOutputTokens: BigInt(request.maxOutputTokens),
          reservedCostMicros: cost,
          estimatedCostMicros: request.estimatedCostMicros === undefined ? undefined : BigInt(request.estimatedCostMicros),
        } });
        await tx.aiBudgetPolicy.update({ where: { id_companyId: { id: budget.id, companyId: context.companyId } }, data: {
          reservedTokens: { increment: tokens }, reservedCostMicros: { increment: cost }, activeReservations: { increment: 1 },
        } });
        await this.auditUsage(tx, context, attempt, "CREATE", "ai.usage.reserve", budget.currency);
        return { allowed: true, reservationId: attempt.id };
      }, { maxWait: 5000, timeout: 10000 });
    } catch {
      return { allowed: false, reason: "METERING_UNAVAILABLE" };
    }
  }

  async settle(context: AiSettlementContext, input: SettleAiUsageInput): Promise<SettlementResult> {
    context = { companyId: context?.companyId, userId: context?.userId };
    if (![context.companyId, context.userId].every((value) => this.identifier(value))) {
      return { recorded: false, reason: "DENIED" };
    }
    if (!input || !this.identifier(input.reservationId) ||
      !["COMPLETED", "FAILED", "CANCELLED"].includes(input.status) ||
      !this.amount(input.latencyMs, 2147483647) ||
      (input.inputTokens === undefined) !== (input.outputTokens === undefined) ||
      [input.inputTokens, input.outputTokens, input.actualCostMicros].some((value) =>
        value !== undefined && !this.amount(value)) ||
      (input.inputTokens !== undefined && !this.amount(input.inputTokens + input.outputTokens!))) {
      return { recorded: false, reason: "INVALID_INPUT" };
    }
    const report = {
      reservationId: input.reservationId, status: input.status, inputTokens: input.inputTokens,
      outputTokens: input.outputTokens, actualCostMicros: input.actualCostMicros, latencyMs: input.latencyMs,
    };
    const settlementHash = this.hash(report);
    try {
      return await this.prisma.$transaction(async (tx): Promise<SettlementResult> => {
        const company = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM companies WHERE id = ${context.companyId} FOR UPDATE
        `;
        if (company.length !== 1) return { recorded: false, reason: "DENIED" };
        const attempt = await tx.aiUsageAttempt.findFirst({ where: {
          id: report.reservationId, companyId: context.companyId, userId: context.userId,
        } });
        if (!attempt) return { recorded: false, reason: "DENIED" };
        if (attempt.status !== "RESERVED") {
          return attempt.settlementHash === settlementHash
            ? { recorded: true, replay: true, exceededReservation: this.exceeded(attempt) }
            : { recorded: false, reason: "IDEMPOTENCY_CONFLICT" };
        }
        const reservedTokens = attempt.maxInputTokens + attempt.maxOutputTokens;
        const chargedTokens = report.inputTokens === undefined ? reservedTokens
          : BigInt(report.inputTokens) + BigInt(report.outputTokens!);
        const chargedCostMicros = report.actualCostMicros === undefined ? attempt.reservedCostMicros : BigInt(report.actualCostMicros);
        const completed = await tx.aiUsageAttempt.update({
          where: { companyId_operationId_attemptNumber: {
            companyId: context.companyId, operationId: attempt.operationId, attemptNumber: attempt.attemptNumber,
          } },
          data: {
            status: report.status, settlementHash, completedAt: new Date(), latencyMs: report.latencyMs,
            inputTokens: report.inputTokens === undefined ? undefined : BigInt(report.inputTokens),
            outputTokens: report.outputTokens === undefined ? undefined : BigInt(report.outputTokens),
            actualCostMicros: report.actualCostMicros === undefined ? undefined : BigInt(report.actualCostMicros),
            chargedTokens, chargedCostMicros,
          },
        });
        const budget = await tx.aiBudgetPolicy.update({ where: { id_companyId: { id: attempt.budgetId, companyId: context.companyId } }, data: {
          reservedTokens: { decrement: reservedTokens }, reservedCostMicros: { decrement: attempt.reservedCostMicros },
          spentTokens: { increment: chargedTokens }, spentCostMicros: { increment: chargedCostMicros },
          activeReservations: { decrement: 1 },
        } });
        await this.auditUsage(tx, { companyId: attempt.companyId, userId: attempt.userId }, completed, "UPDATE", "ai.usage.settle", budget.currency);
        return { recorded: true, replay: false, exceededReservation: this.exceeded(completed) };
      }, { maxWait: 5000, timeout: 10000 });
    } catch {
      return { recorded: false, reason: "METERING_UNAVAILABLE" };
    }
  }

  private async lockAndAuthorize(tx: Prisma.TransactionClient, context: CapabilityContext, admin = false) {
    const company = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM companies WHERE id = ${context.companyId} AND status = 'ACTIVE' FOR UPDATE
    `;
    if (company.length !== 1) return false;
    const membership = await tx.companyUser.findFirst({ where: {
      companyId: context.companyId, userId: context.userId, status: "ACTIVE",
      company: { status: "ACTIVE" },
      user: { status: "ACTIVE", sessions: { some: {
        id: context.sessionId, userId: context.userId, revokedAt: null, expiresAt: { gt: new Date() },
      } } },
    }, select: { role: true } });
    return Boolean(membership && (!admin || ["OWNER", "ADMIN"].includes(membership.role)));
  }

  private async auditUsage(
    tx: Prisma.TransactionClient, context: AiSettlementContext, attempt: AiUsageAttempt,
    action: "CREATE" | "UPDATE", operation: string, currency: string,
  ) {
    const completedAt = attempt.completedAt ?? attempt.createdAt;
    const startedAt = attempt.latencyMs === null ? attempt.createdAt : new Date(completedAt.getTime() - attempt.latencyMs);
    await tx.auditLog.create({ data: {
      companyId: context.companyId, userId: context.userId, action, resource: "ai_metering", resourceId: attempt.id,
      metadata: {
        budgetId: attempt.budgetId, currency, operationId: attempt.operationId, attemptNumber: attempt.attemptNumber,
        status: attempt.status, modelClass: attempt.modelClass, logicalModel: attempt.logicalModel,
        maxInputTokens: attempt.maxInputTokens.toString(), maxOutputTokens: attempt.maxOutputTokens.toString(),
        estimatedCostMicros: attempt.estimatedCostMicros?.toString() ?? null,
        reservedCostMicros: attempt.reservedCostMicros.toString(),
        inputTokens: attempt.inputTokens?.toString() ?? null, outputTokens: attempt.outputTokens?.toString() ?? null,
        actualCostMicros: attempt.actualCostMicros?.toString() ?? null,
        chargedTokens: attempt.chargedTokens?.toString() ?? null, chargedCostMicros: attempt.chargedCostMicros?.toString() ?? null,
        exceededReservation: this.exceeded(attempt),
        observation: buildProcessObservation({
          companyId: context.companyId, correlationId: attempt.correlationId, operation,
          capabilityKey: attempt.capabilityKey, workflowRunId: attempt.workflowRunId ?? undefined,
          workflowStepId: attempt.workflowStepId ?? undefined, startedAt, completedAt,
          result: attempt.status === "FAILED" ? "FAILURE" : attempt.status === "CANCELLED" ? "CANCELLED" : "SUCCESS",
          ...(attempt.status === "FAILED" ? { errorCode: "EXECUTION_FAILED" as const } : {}),
        }),
      },
    } });
  }

  private exceeded(attempt: AiUsageAttempt) {
    return (attempt.inputTokens !== null && attempt.inputTokens > attempt.maxInputTokens) ||
      (attempt.outputTokens !== null && attempt.outputTokens > attempt.maxOutputTokens) ||
      (attempt.chargedCostMicros !== null && attempt.chargedCostMicros > attempt.reservedCostMicros);
  }

  private validReservation(input: ReserveAiUsageInput) {
    return Boolean(input) &&
      [input.operationId, input.correlationId, input.modelClass, input.logicalModel, input.capabilityKey].every((value) => this.identifier(value)) &&
      [input.workflowRunId, input.workflowStepId].every((value) => value === undefined || this.identifier(value)) &&
      (!input.workflowStepId || Boolean(input.workflowRunId)) && /^[A-Z]{3}$/.test(input.currency) &&
      this.amount(input.attemptNumber, 2147483647) && input.attemptNumber >= 1 &&
      this.amount(input.maxInputTokens) && this.amount(input.maxOutputTokens) &&
      this.amount(input.maxInputTokens + input.maxOutputTokens) && input.maxInputTokens + input.maxOutputTokens > 0 &&
      this.amount(input.costCapMicros) && input.costCapMicros > 0 &&
      (input.estimatedCostMicros === undefined ||
        (this.amount(input.estimatedCostMicros) && input.estimatedCostMicros <= input.costCapMicros));
  }

  private contextSnapshot(context: CapabilityContext): CapabilityContext {
    return { companyId: context?.companyId, userId: context?.userId, sessionId: context?.sessionId };
  }

  private validContext(context: CapabilityContext) {
    return [context.companyId, context.userId, context.sessionId].every((value) => this.identifier(value));
  }

  private identifier(value: unknown) {
    return typeof value === "string" && value.trim() !== "" && value.length <= 200 && !/[\r\n\u0000]/.test(value);
  }

  private amount(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
  }

  private hash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
