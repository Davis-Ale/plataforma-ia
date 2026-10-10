import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ProcessObservationInput } from "./process-observation.types";

export function buildProcessObservation(input: ProcessObservationInput) {
  const identifiers = [input.companyId, input.operation, input.correlationId,
    input.capabilityKey, input.workflowKey, input.workflowRunId, input.workflowStepId];
  const durationMs = input.completedAt.getTime() - input.startedAt.getTime();
  if (
    identifiers.slice(0, 2).some((value) => value === undefined) ||
    identifiers.some((value) => value !== undefined &&
      (typeof value !== "string" || value.trim() === "" || /[\r\n\u0000]/.test(value))) ||
    !Number.isFinite(durationMs) || durationMs < 0 ||
    !["SUCCESS", "FAILURE", "DENIED", "APPROVAL_REQUIRED", "CANCELLED"].includes(input.result) ||
    (input.errorCode !== undefined &&
      !["DENIED", "INVALID_INPUT", "EXECUTION_FAILED", "WORKFLOW_FAILED"].includes(input.errorCode))
  ) {
    throw new BadRequestException("Invalid process observation");
  }
  const outcomes: Record<string, number | boolean> = {};
  for (const key of ["timeSavedMs", "slaTargetMs", "errorsAvoided", "manualVolumeReduced"] as const) {
    const value = input.outcomes?.[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      ((key === "errorsAvoided" || key === "manualVolumeReduced") && !Number.isSafeInteger(value))) {
      throw new BadRequestException("Invalid outcome metric");
    }
    outcomes[key] = value;
  }
  if (input.outcomes?.slaMet !== undefined) {
    if (typeof input.outcomes.slaMet !== "boolean") throw new BadRequestException("Invalid SLA metric");
    outcomes.slaMet = input.outcomes.slaMet;
  }
  return {
    version: 1,
    correlationId: input.correlationId ?? randomUUID(),
    operation: input.operation,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    durationMs,
    result: input.result,
    success: input.result === "SUCCESS",
    ...(input.capabilityKey === undefined ? {} : { capabilityKey: input.capabilityKey }),
    ...(input.workflowKey === undefined ? {} : { workflowKey: input.workflowKey }),
    ...(input.workflowRunId === undefined ? {} : { workflowRunId: input.workflowRunId }),
    ...(input.workflowStepId === undefined ? {} : { workflowStepId: input.workflowStepId }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    outcomes,
  };
}
