export type OutcomeMetrics = Readonly<{
  timeSavedMs?: number;
  slaTargetMs?: number;
  slaMet?: boolean;
  errorsAvoided?: number;
  manualVolumeReduced?: number;
}>;

export type ProcessObservationInput = Readonly<{
  companyId: string;
  correlationId?: string;
  operation: string;
  capabilityKey?: string;
  workflowKey?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  startedAt: Date;
  completedAt: Date;
  result: "SUCCESS" | "FAILURE" | "DENIED" | "APPROVAL_REQUIRED" | "CANCELLED";
  errorCode?: "DENIED" | "INVALID_INPUT" | "EXECUTION_FAILED" | "WORKFLOW_FAILED";
  outcomes?: OutcomeMetrics;
}>;
