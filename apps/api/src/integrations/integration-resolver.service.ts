import { Inject, Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  INTEGRATION_BINDING_STORE,
  IntegrationBindingStore,
  snapshotIntegrationBinding,
} from "./integration-binding.store";
import { IntegrationRegistry } from "./integration-registry.service";
import {
  ContractsPort,
  IntegrationBinding,
  OperationsPort,
  PeoplePort,
} from "./integration.types";

@Injectable()
export class IntegrationResolver {
  private readonly snapshot = new AsyncLocalStorage<{ companyId: string; adapter: ContractsPort | OperationsPort | PeoplePort }>();

  withAdapter<T>(companyId: string, adapter: ContractsPort | OperationsPort | PeoplePort, action: () => Promise<T>): Promise<T> {
    return this.snapshot.run({ companyId, adapter }, action);
  }
  constructor(
    private readonly registry: IntegrationRegistry,
    @Inject(INTEGRATION_BINDING_STORE)
    private readonly store: IntegrationBindingStore,
  ) {}

  async bind(binding: IntegrationBinding): Promise<void> {
    binding = snapshotIntegrationBinding(binding);
    this.assertBinding(binding);
    if (!await this.store.create(binding)) {
      throw new Error("Integration binding already exists");
    }
  }

  async replaceBinding(binding: IntegrationBinding): Promise<IntegrationBinding> {
    binding = snapshotIntegrationBinding(binding);
    this.assertBinding(binding);
    const previous = await this.store.find(binding.companyId, binding.kind);
    if (!previous) {
      throw new Error("Integration binding not found");
    }
    if (previous.adapterKey === binding.adapterKey) {
      throw new Error("Integration binding unchanged");
    }
    if (!await this.store.replace(binding, previous.revision)) throw new Error("Integration binding changed concurrently");
    return Object.freeze({
      companyId: binding.companyId,
      kind: binding.kind,
      adapterKey: binding.adapterKey,
    });
  }

  async resolveContracts(companyId: string): Promise<ContractsPort | undefined> {
    const pinned = this.snapshot.getStore();
    if (pinned?.companyId === companyId && pinned.adapter.kind === "contracts") return pinned.adapter;
    if (typeof companyId !== "string" || companyId.trim() === "") return undefined;
    const binding = await this.store.find(companyId, "contracts");
    if (!binding) return undefined;
    return this.registry.getContracts(binding.adapterKey);
  }

  async resolveOperations(companyId: string): Promise<OperationsPort | undefined> {
    const pinned = this.snapshot.getStore();
    if (pinned?.companyId === companyId && pinned.adapter.kind === "operations") return pinned.adapter;
    if (typeof companyId !== "string" || companyId.trim() === "") return undefined;
    const binding = await this.store.find(companyId, "operations");
    if (!binding) return undefined;
    return this.registry.getOperations(binding.adapterKey);
  }

  async resolvePeople(companyId: string): Promise<PeoplePort | undefined> {
    const pinned = this.snapshot.getStore();
    if (pinned?.companyId === companyId && pinned.adapter.kind === "people") return pinned.adapter;
    if (typeof companyId !== "string" || companyId.trim() === "") return undefined;
    const binding = await this.store.find(companyId, "people");
    if (!binding) return undefined;
    return this.registry.getPeople(binding.adapterKey);
  }

  private assertBinding(binding: IntegrationBinding): void {
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
