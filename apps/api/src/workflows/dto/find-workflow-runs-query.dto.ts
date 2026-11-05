import { WorkflowStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

export class FindWorkflowRunsQueryDto {
  @IsOptional()
  @IsString()
  declare page?: string;

  @IsOptional()
  @IsString()
  declare limit?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  declare status?: WorkflowStatus;
}
