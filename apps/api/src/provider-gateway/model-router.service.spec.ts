import { ModelRouter } from "./model-router.service";
import { LogicalModel, ModelRoutingPolicy } from "./provider.types";
import { ProviderRegistry } from "./provider-registry.service";

describe("Model Router policies", () => {
  let router: ModelRouter;
  const model: LogicalModel = {
    key: "economy", providerKey: "adapter-a", providerModel: "technical-a", modelClass: "ECONOMY",
    features: ["TEXT"], maxRisk: "LOW", expectedLatencyMs: 500, contextWindowTokens: 4000,
    maxOutputTokens: 1000, currency: "USD", inputCostMicrosPerMillion: 1000, outputCostMicrosPerMillion: 2000,
  };
  const policy: ModelRoutingPolicy = {
    companyId: "a", capability: "example.read", models: ["economy", "balanced"],
    classes: ["ECONOMY", "BALANCED"], requiredFeatures: ["TEXT"], risk: "LOW", priority: "COST",
    allowFallback: false, currency: "USD", maxCostMicros: 100, maxLatencyMs: 1000,
    maxInputTokens: 1000, maxOutputTokens: 500, maxOutputBytes: 2000, instruction: "Summarize the authorized context.",
  };

  beforeEach(() => {
    router = new ModelRouter();
    router.registerModel(model);
    router.registerModel({ ...model, key: "balanced", providerKey: "adapter-b", modelClass: "BALANCED",
      inputCostMicrosPerMillion: 3000, outputCostMicrosPerMillion: 4000,
      maxRisk: "HIGH", expectedLatencyMs: 100, features: ["TEXT", "STRUCTURED_OUTPUT"] });
  });

  it("starts without tenant policies and denies absent tenant or capability", () => {
    expect(router.route("a", policy.capability)).toBeUndefined();
    router.registerPolicy(policy);
    expect(router.route("", policy.capability)).toBeUndefined();
    expect(router.route("b", policy.capability)).toBeUndefined();
    expect(router.route("a", "other.read")).toBeUndefined();
  });

  it("prefers the least expensive suitable class using upper bounds", () => {
    router.registerPolicy(policy);
    expect(router.route("a", policy.capability)?.candidates.map(({ model: candidate, costCapMicros }) =>
      [candidate.key, costCapMicros])).toEqual([["economy", 2], ["balanced", 5]]);
  });

  it("supports latency priority without weakening other constraints", () => {
    router.registerPolicy({ ...policy, priority: "LATENCY" });
    expect(router.route("a", policy.capability)?.candidates[0].model.key).toBe("balanced");
  });

  it.each([
    { risk: "HIGH" }, { requiredFeatures: ["STRUCTURED_OUTPUT"] },
    { maxLatencyMs: 200 }, { classes: ["BALANCED"] },
  ] as Partial<ModelRoutingPolicy>[])("filters by required risk, capability, latency and class: %j", (requirement) => {
    router.registerPolicy({ ...policy, ...requirement });
    expect(router.route("a", policy.capability)?.candidates.map(({ model: candidate }) => candidate.key)).toEqual(["balanced"]);
  });

  it.each([
    { maxCostMicros: 1 }, { maxInputTokens: 4000 }, { maxOutputTokens: 2000 },
    { currency: "BRL" }, { classes: ["REASONING"] },
  ] as Partial<ModelRoutingPolicy>[])("returns no route instead of weakening a hard constraint: %j", (requirement) => {
    router.registerPolicy({ ...policy, ...requirement });
    expect(router.route("a", policy.capability)?.candidates).toEqual([]);
  });

  it("isolates policy, cost cap and instruction by tenant", () => {
    router.registerPolicy(policy);
    router.registerPolicy({ ...policy, companyId: "b", classes: ["BALANCED"], instruction: "Other instruction" });
    expect(router.route("a", policy.capability)?.candidates[0].model.key).toBe("economy");
    expect(router.route("b", policy.capability)?.candidates[0].model.key).toBe("balanced");
    expect(router.route("a", policy.capability)?.policy.instruction).toBe(policy.instruction);
  });

  it("rounds fractional micros up and handles large costs without overflow", () => {
    router.registerModel({ ...model, key: "tiny", inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 });
    router.registerModel({ ...model, key: "huge", inputCostMicrosPerMillion: Number.MAX_SAFE_INTEGER });
    router.registerPolicy({ ...policy, models: ["tiny", "huge"] });
    expect(router.route("a", policy.capability)?.candidates.map(({ costCapMicros }) => costCapMicros)).toEqual([1]);
  });

  it("uses stable tie-breaking and snapshots registered arrays", () => {
    const mutable = { ...model, key: "aaa", features: ["TEXT"] as LogicalModel["features"] };
    router.registerModel(mutable);
    const selected = ["economy", "aaa"];
    router.registerPolicy({ ...policy, models: selected });
    selected.reverse();
    mutable.providerModel = "changed";
    const route = router.route("a", policy.capability)!;
    expect(route.candidates[0].model.key).toBe("aaa");
    expect(route.candidates[0].model.providerModel).toBe("technical-a");
    expect(Object.isFrozen(route.policy.models)).toBe(true);
    expect(Object.isFrozen(route.candidates)).toBe(true);
  });

  it.each([
    { companyId: "" }, { maxCostMicros: 0 }, { maxLatencyMs: Infinity }, { maxInputTokens: NaN },
    { maxOutputTokens: 0 }, { maxOutputBytes: 65537 }, { models: [] }, { models: ["unknown"] },
    { classes: [] }, { requiredFeatures: [] }, { instruction: " " }, { instruction: "x".repeat(4097) },
  ] as Partial<ModelRoutingPolicy>[])("rejects malformed policies: %j", (invalid) => {
    expect(() => router.registerPolicy({ ...policy, ...invalid })).toThrow();
  });

  it("rejects duplicate policies, models and unsupported model metadata", () => {
    router.registerPolicy(policy);
    expect(() => router.registerPolicy(policy)).toThrow();
    expect(() => router.registerModel(model)).toThrow();
    expect(() => router.registerModel({ ...model, key: "invalid", maxRisk: "UNKNOWN" } as unknown as LogicalModel)).toThrow();
    expect(() => router.registerModel({ ...model, key: "free", inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0 })).toThrow();
  });

  it("has no provider by default and validates adapter registration", () => {
    const providers = new ProviderRegistry();
    expect(providers.resolve("adapter-a")).toBeUndefined();
    const adapter = { key: "adapter-a", countInputTokens: () => 1, generate: jest.fn() };
    providers.register(adapter);
    expect(Object.isFrozen(providers.resolve("adapter-a"))).toBe(true);
    expect(() => providers.register(adapter)).toThrow();
    expect(() => providers.register({ ...adapter, key: "" })).toThrow();
  });
});
