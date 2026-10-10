export type BudgetPolicyInput = Readonly<{
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  enabled: boolean;
  tokenLimit: number;
  costLimitMicros: number;
  maxConcurrent: number;
}>;

export type ReserveAiUsageInput = Readonly<{
  operationId: string;
  attemptNumber: number;
  correlationId: string;
  modelClass: string;
  logicalModel: string;
  capabilityKey: string;
  workflowRunId?: string;
  workflowStepId?: string;
  currency: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  costCapMicros: number;
  estimatedCostMicros?: number;
}>;

export type AiSettlementContext = Readonly<{
  companyId: string;
  userId: string;
}>;

export type SettleAiUsageInput = Readonly<{
  reservationId: string;
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  inputTokens?: number;
  outputTokens?: number;
  actualCostMicros?: number;
  latencyMs: number;
}>;

export type MeteringDenial = "DENIED" | "INVALID_INPUT" | "BUDGET_UNAVAILABLE"
  | "BUDGET_EXCEEDED" | "CONCURRENCY_LIMIT" | "DUPLICATE_ATTEMPT"
  | "IDEMPOTENCY_CONFLICT" | "METERING_UNAVAILABLE";

export type BudgetPolicyResult =
  | { configured: true; budgetId: string }
  | { configured: false; reason: MeteringDenial };

export type ReservationResult =
  | { allowed: true; reservationId: string }
  | { allowed: false; reason: MeteringDenial };

export type SettlementResult =
  | { recorded: true; replay: boolean; exceededReservation: boolean }
  | { recorded: false; reason: MeteringDenial };
