import type { Capability } from "../capabilities/capability.types";
import { IntegrationResolver } from "./integration-resolver.service";
import { PeopleCapacityInput, PeopleCapacityOutput } from "./integration.types";

export const PEOPLE_CAPACITY_CHECK_KEY = "people.capacity.check";

function isPeopleCapacityInput(input: unknown): input is PeopleCapacityInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  return (
    typeof record.planId === "string" &&
    record.planId.trim() !== "" &&
    Array.isArray(record.workstreams) &&
    record.workstreams.every((item) => typeof item === "string") &&
    typeof record.targetStartDate === "string"
  );
}

export function createPeopleCapacityCheckCapability(
  resolver: IntegrationResolver,
): Capability<PeopleCapacityInput, PeopleCapacityOutput> {
  return Object.freeze({
    key: PEOPLE_CAPACITY_CHECK_KEY,
    allowedRoles: Object.freeze(["OWNER", "ADMIN", "MEMBER"] as const),
    approval: Object.freeze({ mode: "NONE" as const }),
    validate: isPeopleCapacityInput,
    authorize: async () => true,
    execute: async (context, input) => {
      const adapter = await resolver.resolvePeople(context.companyId);
      if (!adapter) {
        throw new Error("INTEGRATION_UNAVAILABLE");
      }
      const result = await adapter.checkCapacity(context.companyId, input);
      if (result.companyId !== context.companyId) {
        throw new Error("TENANT_MISMATCH");
      }
      return result;
    },
  });
}
