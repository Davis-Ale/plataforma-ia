import { IntegrationKind } from "./integration.types";

export const INTEGRATION_BINDING_STORE = Symbol("INTEGRATION_BINDING_STORE");

export type IntegrationBindingStore = {
  get(companyId: string, kind: IntegrationKind): Promise<string | undefined>;
  has(companyId: string, kind: IntegrationKind): Promise<boolean>;
  set(companyId: string, kind: IntegrationKind, adapterKey: string): Promise<void>;
};

export class InMemoryIntegrationBindingStore implements IntegrationBindingStore {
  private readonly bindings = new Map<string, Map<IntegrationKind, string>>();

  async get(companyId: string, kind: IntegrationKind): Promise<string | undefined> {
    return this.bindings.get(companyId)?.get(kind);
  }

  async has(companyId: string, kind: IntegrationKind): Promise<boolean> {
    return this.bindings.get(companyId)?.has(kind) === true;
  }

  async set(companyId: string, kind: IntegrationKind, adapterKey: string): Promise<void> {
    const company = this.bindings.get(companyId) ?? new Map<IntegrationKind, string>();
    company.set(kind, adapterKey);
    this.bindings.set(companyId, company);
  }
}
