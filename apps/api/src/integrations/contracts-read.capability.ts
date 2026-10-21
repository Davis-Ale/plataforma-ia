import type { Capability } from "../capabilities/capability.types";
import { IntegrationResolver } from "./integration-resolver.service";
import { ContractsReadInput, ContractsReadOutput } from "./integration.types";

export const CONTRACTS_READ_KEY = "contracts.read";

function isContractsReadInput(input: unknown): input is ContractsReadInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  return typeof record.externalRef === "string" && record.externalRef.trim() !== "";
}

export function createContractsReadCapability(
  resolver: IntegrationResolver,
): Capability<ContractsReadInput, ContractsReadOutput> {
  return Object.freeze({
    key: CONTRACTS_READ_KEY,
    allowedRoles: Object.freeze(["OWNER", "ADMIN", "MEMBER"] as const),
    approval: Object.freeze({ mode: "NONE" as const }),
    validate: isContractsReadInput,
    authorize: async () => true,
    execute: async (context, input) => {
      const adapter = await resolver.resolveContracts(context.companyId);
      if (!adapter) {
        throw new Error("INTEGRATION_UNAVAILABLE");
      }
      const result = await adapter.read(context.companyId, input);
      if (result.companyId !== context.companyId) {
        throw new Error("TENANT_MISMATCH");
      }
      return result;
    },
  });
}
