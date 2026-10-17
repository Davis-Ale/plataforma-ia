import { CapabilityRegistry } from "../capabilities/capability-registry.service";
import { TEXT_SUMMARIZE_CAPABILITY_KEY } from "../capabilities/text-summarize.capability";
import { ModelRouter } from "./model-router.service";
import { ProviderBootstrapService } from "./provider-bootstrap.service";
import { ProviderRegistry } from "./provider-registry.service";

describe("ProviderBootstrapService", () => {
  it("registers capability and model on init without enabling tenant policy", () => {
    const models = new ModelRouter();
    const providers = new ProviderRegistry();
    const capabilities = new CapabilityRegistry();
    const config = { get: (key: string) => (key === "OPENAI_API_KEY" ? "sk-test" : undefined) };
    const bootstrap = new ProviderBootstrapService(
      config as never,
      models,
      providers,
      capabilities,
    );
    bootstrap.onModuleInit();
    expect(bootstrap.isProviderReady()).toBe(true);
    expect(capabilities.resolve(TEXT_SUMMARIZE_CAPABILITY_KEY)?.key).toBe(TEXT_SUMMARIZE_CAPABILITY_KEY);
    expect(models.route("company-a", TEXT_SUMMARIZE_CAPABILITY_KEY)).toBeUndefined();
    bootstrap.enableTextSummarizeForCompany("company-a");
    const route = models.route("company-a", TEXT_SUMMARIZE_CAPABILITY_KEY);
    expect(route?.candidates.length).toBe(1);
    expect(route?.candidates[0].model.key).toBe("text-economy");
    expect(route?.candidates[0].model.providerKey).toBe("openai");
    expect(providers.resolve("openai")?.key).toBe("openai");
  });

  it("does not enable provider without api key", () => {
    const models = new ModelRouter();
    const providers = new ProviderRegistry();
    const capabilities = new CapabilityRegistry();
    const config = { get: () => undefined };
    const bootstrap = new ProviderBootstrapService(
      config as never,
      models,
      providers,
      capabilities,
    );
    bootstrap.onModuleInit();
    expect(bootstrap.isProviderReady()).toBe(false);
    expect(providers.resolve("openai")).toBeUndefined();
  });

  it("rejects invalid companyId when enabling policy", () => {
    const models = new ModelRouter();
    const providers = new ProviderRegistry();
    const capabilities = new CapabilityRegistry();
    const config = { get: (key: string) => (key === "OPENAI_API_KEY" ? "sk-test" : undefined) };
    const bootstrap = new ProviderBootstrapService(
      config as never,
      models,
      providers,
      capabilities,
    );
    bootstrap.onModuleInit();
    expect(() => bootstrap.enableTextSummarizeForCompany("")).toThrow();
  });
});
