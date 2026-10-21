import { Inject, Injectable } from "@nestjs/common";
import {
  INTEGRATION_BINDING_STORE,
  IntegrationBindingStore,
} from "./integration-binding.store";
import { IntegrationRegistry } from "./integration-registry.service";
import {
  ContractsPort,
  IntegrationBinding,
  IntegrationKind,
  OperationsPort,
  PeoplePort,
} from "./integration.types";

const KINDS: readonly IntegrationKind[] = ["contracts", "operations", "people"];

@Injectable()
export class IntegrationResolver {
  constructor(
    private readonly registry: IntegrationRegistry,
    @Inject(INTEGRATION_BINDING_STORE)
    private readonly store: IntegrationBindingStore,
  ) {}

  async bind(binding: IntegrationBinding): Promise<void> {
    this.assertBinding(binding);
    if (await this.store.has(binding.companyId, binding.kind)) {
      throw new Error("Integration binding already exists");
    }
    await this.store.set(binding.companyId, binding.kind, binding.adapterKey);
  }

  async replaceBinding(binding: IntegrationBinding): Promise<IntegrationBinding> {
    this.assertBinding(binding);
    if (!(await this.store.has(binding.companyId, binding.kind))) {
      throw new Error("Integration binding not found");
    }
    const previousAdapterKey = await this.store.get(binding.companyId, binding.kind);
    if (previousAdapterKey === binding.adapterKey) {
      throw new Error("Integration binding unchanged");
    }
    await this.store.set(binding.companyId, binding.kind, binding.adapterKey);
    return Object.freeze({
      companyId: binding.companyId,
      kind: binding.kind,
      adapterKey: binding.adapterKey,
    });
  }

  async resolveContracts(companyId: string): Promise<ContractsPort | undefined> {
    if (typeof companyId !== "string" || companyId.trim() === "") return undefined;
    const adapterKey = await this.store.get(companyId, "contracts");
    if (!adapterKey) return undefined;
    return this.registry.getContracts(adapterKey);
  }

  async resolveOperations(companyId: string): Promise<OperationsPort | undefined> {
    if (typeof companyId !== "string" || companyId.trim() === "") return undefined;
    const adapterKey = await this.store.get(companyId, "operations");
    if (!adapterKey) return undefined;
    return this.registry.getOperations(adapterKey);
  }

  async resolvePeople(companyId: string): Promise<PeoplePort | undefined> {
    if (typeof companyId !== "string" || companyId.trim() === "") return undefined;
    const adapterKey = await this.store.get(companyId, "people");
    if (!adapterKey) return undefined;
    return this.registry.getPeople(adapterKey);
  }

  private assertBinding(binding: IntegrationBinding): void {
    if (
      !binding ||
      typeof binding.companyId !== "string" ||
      binding.companyId.trim() === "" ||
      typeof binding.adapterKey !== "string" ||
      binding.adapterKey.trim() === "" ||
      !KINDS.includes(binding.kind as IntegrationKind)
    ) {
      throw new Error("Invalid integration binding");
    }
    if (binding.kind === "contracts" && !this.registry.getContracts(binding.adapterKey)) {
      throw new Error("Unknown contracts adapter");
    }
    if (binding.kind === "operations" && !this.registry.getOperations(binding.adapterKey)) {
      throw new Error("Unknown operations adapter");
    }
    if (binding.kind === "people" && !this.registry.getPeople(binding.adapterKey)) {
      throw new Error("Unknown people adapter");
    }
  }
}
