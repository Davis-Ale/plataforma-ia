import { randomUUID } from "node:crypto";
import { OperationsPlanInput, OperationsPlanOutput, OperationsPort } from "../integration.types";

export const DEMO_OPERATIONS_ADAPTER_KEY = "demo-operations";

export function createDemoOperationsAdapter(): OperationsPort {
  return Object.freeze({
    key: DEMO_OPERATIONS_ADAPTER_KEY,
    kind: "operations" as const,
    async plan(companyId: string, input: OperationsPlanInput): Promise<OperationsPlanOutput> {
      if (typeof companyId !== "string" || companyId.trim() === "") {
        throw new Error("Invalid companyId");
      }
      if (
        !input ||
        typeof input.contractExternalRef !== "string" ||
        typeof input.contractName !== "string" ||
        typeof input.clientName !== "string" ||
        typeof input.startDate !== "string" ||
        input.contractExternalRef.trim() === "" ||
        input.startDate.trim() === ""
      ) {
        throw new Error("Invalid operations plan input");
      }
      return Object.freeze({
        companyId,
        planId: randomUUID(),
        contractExternalRef: input.contractExternalRef.trim().toUpperCase(),
        workstreams: Object.freeze([
          "kickoff",
          "resource_allocation",
          "sla_baseline",
          "client_handoff",
        ]),
        targetStartDate: input.startDate.trim(),
        simulated: true,
        sourceAdapter: DEMO_OPERATIONS_ADAPTER_KEY,
      });
    },
  });
}
