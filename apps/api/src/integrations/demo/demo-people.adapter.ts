import { PeopleCapacityInput, PeopleCapacityOutput, PeoplePort } from "../integration.types";

export const DEMO_PEOPLE_ADAPTER_KEY = "demo-people";

export function createDemoPeopleAdapter(): PeoplePort {
  return Object.freeze({
    key: DEMO_PEOPLE_ADAPTER_KEY,
    kind: "people" as const,
    replaySafety: "READ_ONLY" as const,
    async checkCapacity(companyId: string, input: PeopleCapacityInput): Promise<PeopleCapacityOutput> {
      if (typeof companyId !== "string" || companyId.trim() === "") {
        throw new Error("Invalid companyId");
      }
      if (
        !input ||
        typeof input.planId !== "string" ||
        input.planId.trim() === "" ||
        !Array.isArray(input.workstreams) ||
        typeof input.targetStartDate !== "string"
      ) {
        throw new Error("Invalid people capacity input");
      }
      const gaps =
        input.workstreams.includes("resource_allocation") && input.workstreams.length > 3
          ? Object.freeze(["specialist_availability"])
          : Object.freeze([] as string[]);
      return Object.freeze({
        companyId,
        planId: input.planId,
        available: gaps.length === 0,
        gaps,
        simulated: true,
        sourceAdapter: DEMO_PEOPLE_ADAPTER_KEY,
      });
    },
  });
}
