import { WorkflowStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  declare operationId?: string;
}
