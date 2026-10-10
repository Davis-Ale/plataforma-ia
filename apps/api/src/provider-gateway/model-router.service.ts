import { Injectable } from "@nestjs/common";
import { LogicalModel, ModelClass, ModelFeature, ModelRisk, ModelRoute, ModelRoutingPolicy } from "./provider.types";
import { amount, identifier, listOf, oneOf, positive } from "./provider-validation";

const classes = ["ECONOMY", "BALANCED", "REASONING"] as const;
const features = ["TEXT", "STRUCTURED_OUTPUT"] as const;
const risks = ["LOW", "MEDIUM", "HIGH"] as const;
const validClass = (value: unknown): value is ModelClass => oneOf(value, classes);
const validFeature = (value: unknown): value is ModelFeature => oneOf(value, features);
const validRisk = (value: unknown): value is ModelRisk => oneOf(value, risks);

@Injectable()
export class ModelRouter {
  private readonly models = new Map<string, LogicalModel>();
  private readonly policies = new Map<string, Map<string, ModelRoutingPolicy>>();

  registerModel(model: LogicalModel): void {
    if (!model || ![model.key, model.providerKey, model.providerModel].every(identifier) ||
      this.models.has(model.key) || !validClass(model.modelClass) || !validRisk(model.maxRisk) ||
      !listOf(model.features, validFeature) || !positive(model.expectedLatencyMs, 60_000) ||
      !positive(model.contextWindowTokens) || !positive(model.maxOutputTokens) ||
      model.maxOutputTokens > model.contextWindowTokens || !/^[A-Z]{3}$/.test(model.currency) ||
      !amount(model.inputCostMicrosPerMillion) || !amount(model.outputCostMicrosPerMillion) ||
      model.inputCostMicrosPerMillion + model.outputCostMicrosPerMillion === 0) {
      throw new Error("Invalid or duplicate logical model");
    }
    this.models.set(model.key, Object.freeze({
      key: model.key, providerKey: model.providerKey, providerModel: model.providerModel,
      modelClass: model.modelClass, features: Object.freeze([...model.features]), maxRisk: model.maxRisk,
      expectedLatencyMs: model.expectedLatencyMs, contextWindowTokens: model.contextWindowTokens,
      maxOutputTokens: model.maxOutputTokens, currency: model.currency,
      inputCostMicrosPerMillion: model.inputCostMicrosPerMillion,
      outputCostMicrosPerMillion: model.outputCostMicrosPerMillion,
    }));
  }

  registerPolicy(policy: ModelRoutingPolicy): void {
    if (!policy || !identifier(policy.companyId) || !identifier(policy.capability) ||
      this.policies.get(policy.companyId)?.has(policy.capability) ||
      !listOf(policy.models, identifier) || policy.models.some((key) => !this.models.has(key)) ||
      !listOf(policy.classes, validClass) || !listOf(policy.requiredFeatures, validFeature) ||
      !validRisk(policy.risk) || !oneOf(policy.priority, ["COST", "LATENCY"]) ||
      typeof policy.allowFallback !== "boolean" || !/^[A-Z]{3}$/.test(policy.currency) ||
      !positive(policy.maxCostMicros) || !positive(policy.maxLatencyMs, 60_000) ||
      !positive(policy.maxInputTokens) || !positive(policy.maxOutputTokens) ||
      !amount(policy.maxInputTokens + policy.maxOutputTokens) ||
      !positive(policy.maxOutputBytes, 65_536) || typeof policy.instruction !== "string" ||
      policy.instruction.trim() === "" || Buffer.byteLength(policy.instruction, "utf8") > 4096) {
      throw new Error("Invalid or duplicate model routing policy");
    }
    const snapshot: ModelRoutingPolicy = Object.freeze({
      companyId: policy.companyId, capability: policy.capability,
      models: Object.freeze([...policy.models]), classes: Object.freeze([...policy.classes]),
      requiredFeatures: Object.freeze([...policy.requiredFeatures]), risk: policy.risk,
      priority: policy.priority, allowFallback: policy.allowFallback, currency: policy.currency,
      maxCostMicros: policy.maxCostMicros, maxLatencyMs: policy.maxLatencyMs,
      maxInputTokens: policy.maxInputTokens, maxOutputTokens: policy.maxOutputTokens,
      maxOutputBytes: policy.maxOutputBytes, instruction: policy.instruction,
    });
    const companyPolicies = this.policies.get(snapshot.companyId) ?? new Map<string, ModelRoutingPolicy>();
    companyPolicies.set(snapshot.capability, snapshot);
    this.policies.set(snapshot.companyId, companyPolicies);
  }

  route(companyId: string, capability: string): ModelRoute | undefined {
    if (!identifier(companyId) || !identifier(capability)) return undefined;
    const policy = this.policies.get(companyId)?.get(capability);
    if (!policy) return undefined;
    const candidates = policy.models.flatMap((key) => {
      const model = this.models.get(key)!;
      if (!policy.classes.includes(model.modelClass) || model.currency !== policy.currency ||
        risks.indexOf(model.maxRisk) < risks.indexOf(policy.risk) ||
        model.expectedLatencyMs > policy.maxLatencyMs || model.maxOutputTokens < policy.maxOutputTokens ||
        model.contextWindowTokens < policy.maxInputTokens + policy.maxOutputTokens ||
        policy.requiredFeatures.some((feature) => !model.features.includes(feature))) return [];
      const cost = (BigInt(policy.maxInputTokens) * BigInt(model.inputCostMicrosPerMillion) +
        BigInt(policy.maxOutputTokens) * BigInt(model.outputCostMicrosPerMillion) + 999_999n) / 1_000_000n;
      if (cost <= 0n || cost > BigInt(policy.maxCostMicros)) return [];
      return [Object.freeze({ model, costCapMicros: Number(cost) })];
    });
    candidates.sort((left, right) => {
      const cost = left.costCapMicros - right.costCapMicros;
      const latency = left.model.expectedLatencyMs - right.model.expectedLatencyMs;
      return (policy.priority === "COST" ? cost || latency : latency || cost) ||
        (left.model.key < right.model.key ? -1 : left.model.key > right.model.key ? 1 : 0);
    });
    return Object.freeze({ companyId, policy, candidates: Object.freeze(candidates) });
  }
}
