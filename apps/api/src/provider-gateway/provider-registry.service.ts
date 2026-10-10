import { Injectable } from "@nestjs/common";
import { ProviderAdapter } from "./provider.types";
import { identifier } from "./provider-validation";

@Injectable()
export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    if (!adapter || !identifier(adapter.key) || this.adapters.has(adapter.key) ||
      typeof adapter.countInputTokens !== "function" || typeof adapter.generate !== "function") {
      throw new Error("Invalid or duplicate provider registration");
    }
    this.adapters.set(adapter.key, Object.freeze({ key: adapter.key,
      countInputTokens: adapter.countInputTokens.bind(adapter), generate: adapter.generate.bind(adapter) }));
  }

  resolve(key: string): ProviderAdapter | undefined {
    return this.adapters.get(key);
  }
}
