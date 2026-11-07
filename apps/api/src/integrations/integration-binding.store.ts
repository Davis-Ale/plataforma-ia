import { IntegrationBinding, IntegrationKind } from "./integration.types";

export const INTEGRATION_BINDING_STORE = Symbol("INTEGRATION_BINDING_STORE");
export type IntegrationBindingRecord = IntegrationBinding & Readonly<{ revision: number }>;

export function snapshotIntegrationBinding(binding: IntegrationBinding): IntegrationBinding {
  const snapshot = { companyId: binding?.companyId, kind: binding?.kind, adapterKey: binding?.adapterKey };
  if (![snapshot.companyId, snapshot.adapterKey].every((value) => typeof value === "string" && value.trim() !== "") ||
    !["contracts", "operations", "people"].includes(snapshot.kind)) throw new Error("Invalid integration binding");
  return Object.freeze(snapshot);
}

export type IntegrationBindingStore = {
  find(companyId: string, kind: IntegrationKind): Promise<IntegrationBindingRecord | undefined>;
  create(binding: IntegrationBinding): Promise<boolean>;
  replace(binding: IntegrationBinding, expectedRevision: number): Promise<boolean>;
};

export class InMemoryIntegrationBindingStore implements IntegrationBindingStore {
  private readonly bindings = new Map<string, Map<IntegrationKind, IntegrationBindingRecord>>();

  async find(companyId: string, kind: IntegrationKind): Promise<IntegrationBindingRecord | undefined> {
    return this.bindings.get(companyId)?.get(kind);
  }

  async create(binding: IntegrationBinding): Promise<boolean> {
    binding = snapshotIntegrationBinding(binding);
    const company = this.bindings.get(binding.companyId) ?? new Map<IntegrationKind, IntegrationBindingRecord>();
    if (company.has(binding.kind)) return false;
    company.set(binding.kind, Object.freeze({ ...binding, revision: 1 }));
    this.bindings.set(binding.companyId, company);
    return true;
  }

  async replace(binding: IntegrationBinding, expectedRevision: number): Promise<boolean> {
    binding = snapshotIntegrationBinding(binding);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Invalid integration binding revision");
    const company = this.bindings.get(binding.companyId);
    const current = company?.get(binding.kind);
    if (!current || current.revision !== expectedRevision || current.adapterKey === binding.adapterKey) return false;
    company!.set(binding.kind, Object.freeze({ ...binding, revision: current.revision + 1 }));
    return true;
  }
}
