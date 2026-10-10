import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AiMeteringService } from "../ai-metering/ai-metering.service";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { CapabilityContext } from "../capabilities/capability.types";
import { createImmutableInput } from "../capabilities/immutable-input";
import { MAX_CONTEXT_BYTES } from "../context-engine/context-engine";
import { ProcessObservabilityService } from "../observability/process-observability.service";
import { ModelRouter } from "./model-router.service";
import { ProviderRegistry } from "./provider-registry.service";
import { ProviderAdapter, ProviderGatewayRequest, ProviderGatewayResult, ProviderInvocation, ProviderUsage } from "./provider.types";
import { amount, identifier, positive } from "./provider-validation";

class ProviderTimeoutError extends Error {}

@Injectable()
export class ProviderGateway {
  constructor(
    private readonly authorization: AuthorizationGateway,
    private readonly router: ModelRouter,
    private readonly providers: ProviderRegistry,
    private readonly metering: AiMeteringService,
    private readonly observability: ProcessObservabilityService,
  ) {}

  async generate(context: CapabilityContext, request: ProviderGatewayRequest): Promise<ProviderGatewayResult> {
    if (!context || ![context.companyId, context.userId, context.sessionId].every(identifier) ||
      (context.correlationId !== undefined && !identifier(context.correlationId))) {
      return { success: false, error: "DENIED" };
    }
    const trustedContext = Object.freeze({ companyId: context.companyId, userId: context.userId,
      sessionId: context.sessionId, correlationId: context.correlationId ?? randomUUID() });
    if (!request || !identifier(request.capability) || !identifier(request.operationId) ||
      !positive(request.attemptNumber, 2147483647) ||
      [request.approvalId, request.workflowRunId, request.workflowStepId].some((value) => value !== undefined && !identifier(value)) ||
      (request.workflowStepId !== undefined && request.workflowRunId === undefined) ||
      Object.keys(request).some((key) => !["capability", "input", "approvalId", "operationId", "attemptNumber", "workflowRunId", "workflowStepId"].includes(key))) {
      return { success: false, error: "INVALID_INPUT" };
    }
    let snapshot: ProviderGatewayRequest;
    try {
      snapshot = Object.freeze({ capability: request.capability, input: createImmutableInput(request.input),
        approvalId: request.approvalId, operationId: request.operationId, attemptNumber: request.attemptNumber,
        workflowRunId: request.workflowRunId, workflowStepId: request.workflowStepId });
    } catch {
      return { success: false, error: "INVALID_INPUT" };
    }
    const startedAt = new Date();
    let result: ProviderGatewayResult;
    try {
      result = await this.generateAuthorized(trustedContext, snapshot);
    } catch {
      result = { success: false, error: "EXECUTION_FAILED" };
    }
    const denied = !result.success && ["DENIED", "BUDGET_DENIED", "POLICY_UNAVAILABLE", "NO_ROUTE", "PROVIDER_UNAVAILABLE"].includes(result.error);
    try {
      await this.observability.record({ companyId: trustedContext.companyId,
        correlationId: trustedContext.correlationId, capabilityKey: snapshot.capability,
        workflowRunId: snapshot.workflowRunId, workflowStepId: snapshot.workflowStepId,
        operation: "ai.provider.generate", startedAt, completedAt: new Date(),
        result: result.success ? "SUCCESS" : result.error === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : denied ? "DENIED" : "FAILURE",
        ...(!result.success && result.error !== "APPROVAL_REQUIRED" ? { errorCode: denied ? "DENIED" as const : "EXECUTION_FAILED" as const } : {}),
      });
    } catch {
      return { success: false, error: "OBSERVABILITY_UNAVAILABLE" };
    }
    return result;
  }

  private async generateAuthorized(
    context: CapabilityContext & { correlationId: string },
    request: ProviderGatewayRequest,
  ): Promise<ProviderGatewayResult> {
    const prepared = await this.authorization.prepareGenerationContext(context, {
      capability: request.capability, input: request.input, approvalId: request.approvalId,
    });
    if (!prepared.success) return prepared;
    if (prepared.output.companyId !== context.companyId || prepared.output.capability !== request.capability ||
      prepared.output.correlationId !== context.correlationId || typeof prepared.output.content !== "string" ||
      Buffer.byteLength(prepared.output.content, "utf8") > MAX_CONTEXT_BYTES) {
      return { success: false, error: "DENIED" };
    }
    const route = this.router.route(context.companyId, request.capability);
    if (!route) return { success: false, error: "POLICY_UNAVAILABLE" };
    if (route.candidates.length === 0) return { success: false, error: "NO_ROUTE" };
    const { policy } = route;
    const candidates = policy.allowFallback ? route.candidates : route.candidates.slice(0, 1);
    const selected = candidates.find((candidate) => this.providers.resolve(candidate.model.providerKey) !== undefined);
    if (!selected) return { success: false, error: "PROVIDER_UNAVAILABLE" };
    const adapter = this.providers.resolve(selected.model.providerKey)!;
    const prompt = JSON.stringify({ instruction: policy.instruction, context: prepared.output.content });
    let inputTokens: number;
    try {
      inputTokens = adapter.countInputTokens(selected.model.providerModel, prompt);
    } catch {
      return { success: false, error: "PROVIDER_FAILED" };
    }
    if (!positive(inputTokens) || inputTokens > policy.maxInputTokens) {
      return { success: false, error: "LIMIT_EXCEEDED" };
    }
    const routedAt = new Date();
    try {
      await this.observability.record({ companyId: context.companyId, correlationId: context.correlationId,
        capabilityKey: request.capability, operation: selected === route.candidates[0] ? "ai.model.route" : "ai.model.fallback",
        startedAt: routedAt, completedAt: routedAt, result: "SUCCESS" });
    } catch {
      return { success: false, error: "OBSERVABILITY_UNAVAILABLE" };
    }
    let reservation;
    try {
      reservation = await this.metering.reserve(context, {
        operationId: request.operationId, attemptNumber: request.attemptNumber, correlationId: context.correlationId,
        capabilityKey: request.capability, workflowRunId: request.workflowRunId, workflowStepId: request.workflowStepId,
        modelClass: selected.model.modelClass, logicalModel: selected.model.key, currency: policy.currency,
        maxInputTokens: policy.maxInputTokens, maxOutputTokens: policy.maxOutputTokens, costCapMicros: selected.costCapMicros,
      });
    } catch {
      return { success: false, error: "METERING_UNAVAILABLE" };
    }
    if (reservation.allowed !== true) return { success: false,
      error: reservation.reason === "METERING_UNAVAILABLE" ? "METERING_UNAVAILABLE" : "BUDGET_DENIED" };
    const startedAt = Date.now();
    let output: string | undefined;
    let usage: ProviderUsage | undefined;
    let error: "PROVIDER_FAILED" | "LIMIT_EXCEEDED" | undefined;
    try {
      const response = await this.invoke(adapter, {
        companyId: context.companyId, correlationId: context.correlationId,
        operationId: request.operationId, attemptNumber: request.attemptNumber,
        model: selected.model.providerModel, prompt, maxInputTokens: policy.maxInputTokens,
        maxOutputTokens: policy.maxOutputTokens, maxOutputBytes: policy.maxOutputBytes,
        costCapMicros: selected.costCapMicros, currency: policy.currency,
      }, policy.maxLatencyMs);
      if (response?.companyId === context.companyId) {
        const report = response.usage;
        if (report && amount(report.inputTokens) && amount(report.outputTokens) &&
          amount(report.inputTokens + report.outputTokens) && amount(report.actualCostMicros)) {
          usage = Object.freeze({ inputTokens: report.inputTokens, outputTokens: report.outputTokens,
            actualCostMicros: report.actualCostMicros });
        }
        if (typeof response.output === "string") output = response.output;
      }
      if (!usage || output === undefined) error = "PROVIDER_FAILED";
      else if (usage.inputTokens > policy.maxInputTokens || usage.outputTokens > policy.maxOutputTokens ||
        usage.actualCostMicros > selected.costCapMicros || Buffer.byteLength(output, "utf8") > policy.maxOutputBytes) {
        error = "LIMIT_EXCEEDED";
      }
    } catch (failure) {
      if (failure instanceof ProviderTimeoutError) return { success: false, error: "PROVIDER_FAILED" };
      error = "PROVIDER_FAILED";
    }
    try {
      const settled = await this.metering.settle({ companyId: context.companyId, userId: context.userId }, {
        reservationId: reservation.reservationId, status: error === undefined ? "COMPLETED" : "FAILED",
        latencyMs: Math.min(2147483647, Math.max(0, Date.now() - startedAt)), ...usage,
      });
      if (settled.recorded !== true) return { success: false, error: "METERING_UNAVAILABLE" };
      if (settled.exceededReservation) return { success: false, error: "LIMIT_EXCEEDED" };
    } catch {
      return { success: false, error: "METERING_UNAVAILABLE" };
    }
    if (error !== undefined) return { success: false, error };
    return { success: true, companyId: context.companyId, correlationId: context.correlationId, output: output! };
  }

  private async invoke(adapter: ProviderAdapter, request: Omit<ProviderInvocation, "signal">, timeoutMs: number) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new ProviderTimeoutError()); controller.abort(); }, timeoutMs);
    });
    try {
      return await Promise.race([
        Promise.resolve().then(() => adapter.generate(Object.freeze({ ...request, signal: controller.signal }))),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
