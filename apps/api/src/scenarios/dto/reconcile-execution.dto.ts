import { WorkflowReconciliationOutcome } from "@prisma/client";
import { IsEnum, IsUUID, Matches } from "class-validator";

export class ReconcileExecutionDto {
  @IsUUID()
  declare incidentId: string;

  @IsEnum(WorkflowReconciliationOutcome)
  declare outcome: WorkflowReconciliationOutcome;

  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)
  declare evidenceReference: string;
}
