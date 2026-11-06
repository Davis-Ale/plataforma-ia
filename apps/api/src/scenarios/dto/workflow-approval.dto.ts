import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from "class-validator";
import { CapabilityApprovalDecision } from "@prisma/client";
import { WorkflowApprovalStatus } from "../workflow-approval.service";

export class FindWorkflowApprovalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @IsOptional()
  @IsIn(["PENDING", "APPROVED", "REJECTED"])
  status: WorkflowApprovalStatus = "PENDING";
}

export class DecideWorkflowApprovalDto {
  @IsIn(["APPROVED", "REJECTED"])
  declare decision: CapabilityApprovalDecision;

  @Matches(/^[a-f0-9]{64}$/)
  declare reviewToken: string;
}
