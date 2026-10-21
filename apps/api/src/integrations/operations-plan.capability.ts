import type { Capability } from "../capabilities/capability.types";
import { IntegrationResolver } from "./integration-resolver.service";
import { OperationsPlanInput, OperationsPlanOutput } from "./integration.types";

export const OPERATIONS_PLAN_KEY = "operations.plan";

function isOperationsPlanInput(input: unknown): input is OperationsPlanInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  return (
    typeof record.contractExternalRef === "string" &&
    record.contractExternalRef.trim() !== "" &&
    typeof record.contractName === "string" &&
    typeof record.clientName === "string" &&
    typeof record.startDate === "string" &&
    record.startDate.trim() !== ""
  );
}

export function createOperationsPlanCapability(
  resolver: IntegrationResolver,
): Capability<OperationsPlanInput, OperationsPlanOutput> {
  return Object.freeze({
    key: OPERATIONS_PLAN_KEY,
    allowedRoles: Object.freeze(["OWNER", "ADMIN", "MEMBER"] as const),
    approval: Object.freeze({ mode: "NONE" as const }),
    validate: isOperationsPlanInput,
    authorize: async () => true,
    execute: async (context, input) => {
      const adapter = await resolver.resolveOperations(context.companyId);
      if (!adapter) {
        throw new Error("INTEGRATION_UNAVAILABLE");
      }
      const result = await adapter.plan(context.companyId, input);
      if (result.companyId !== context.companyId) {
        throw new Error("TENANT_MISMATCH");
      }
      return result;
    },
  });
}
