import { ContractsReadOutput, OperationsPlanOutput } from "../integrations/integration.types";

export const PREPARE_OPERATION_WORKFLOW_KEY = "operations.prepare_from_contract";
export const PREPARE_OPERATION_VERSION = "1";
export const PREPARE_OPERATION_STEPS = [
  { stepKey: "read_contract", capabilityKey: "contracts.read", integrationKind: "contracts" },
  { stepKey: "plan_operations", capabilityKey: "operations.plan", integrationKind: "operations" },
  { stepKey: "check_capacity", capabilityKey: "people.capacity.check", integrationKind: "people" },
] as const;

export function prepareOperationStepInput(index: number, runInput: unknown, outputs: readonly unknown[]) {
  const contract = outputs[0] as ContractsReadOutput;
  const operation = outputs[1] as OperationsPlanOutput;
  if (index === 0) return { externalRef: (runInput as { contractExternalRef: string }).contractExternalRef };
  if (index === 1) return { contractExternalRef: contract.externalRef, contractName: contract.name, clientName: contract.clientName, startDate: contract.startDate };
  if (index === 2) return { planId: operation.planId, workstreams: operation.workstreams, targetStartDate: operation.targetStartDate };
  throw new Error("Unsupported operation step");
}
