import type { CapabilityRequest } from "../capabilities/capability.types";

export type ModelClass = "ECONOMY" | "BALANCED" | "REASONING";
export type ModelFeature = "TEXT" | "STRUCTURED_OUTPUT";
export type ModelRisk = "LOW" | "MEDIUM" | "HIGH";

export type LogicalModel = Readonly<{
  key: string;
  providerKey: string;
  providerModel: string;
  modelClass: ModelClass;
  features: readonly ModelFeature[];
  maxRisk: ModelRisk;
  expectedLatencyMs: number;
  contextWindowTokens: number;
  maxOutputTokens: number;
  currency: string;
  inputCostMicrosPerMillion: number;
  outputCostMicrosPerMillion: number;
}>;

export type ModelRoutingPolicy = Readonly<{
  companyId: string;
  capability: string;
  models: readonly string[];
  classes: readonly ModelClass[];
  requiredFeatures: readonly ModelFeature[];
  risk: ModelRisk;
  priority: "COST" | "LATENCY";
  allowFallback: boolean;
  currency: string;
  maxCostMicros: number;
  maxLatencyMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxOutputBytes: number;
  instruction: string;
}>;

export type ModelRoute = Readonly<{
  companyId: string;
  policy: ModelRoutingPolicy;
  candidates: readonly Readonly<{ model: LogicalModel; costCapMicros: number }>[];
}>;

export type ProviderInvocation = Readonly<{
  companyId: string;
  correlationId: string;
  operationId: string;
  attemptNumber: number;
  model: string;
  prompt: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxOutputBytes: number;
  costCapMicros: number;
  currency: string;
  signal: AbortSignal;
}>;

export type ProviderUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  actualCostMicros: number;
}>;

export type ProviderResponse = Readonly<{
  companyId: string;
  output: string;
  usage: ProviderUsage;
}>;

export type ProviderAdapter = Readonly<{
  key: string;
  countInputTokens: (model: string, prompt: string) => number;
  generate: (request: ProviderInvocation) => Promise<ProviderResponse>;
}>;

export type ProviderGatewayRequest = CapabilityRequest & Readonly<{
  operationId: string;
  attemptNumber: number;
  workflowRunId?: string;
  workflowStepId?: string;
}>;

export type ProviderGatewayResult =
  | Readonly<{ success: true; companyId: string; correlationId: string; output: string }>
  | Readonly<{ success: false; error: "APPROVAL_REQUIRED"; approvalId: string }>
  | Readonly<{ success: false; error:
      "DENIED" | "INVALID_INPUT" | "EXECUTION_FAILED" | "POLICY_UNAVAILABLE" |
      "NO_ROUTE" | "PROVIDER_UNAVAILABLE" | "BUDGET_DENIED" | "METERING_UNAVAILABLE" |
      "PROVIDER_FAILED" | "LIMIT_EXCEEDED" | "OBSERVABILITY_UNAVAILABLE" }>;
