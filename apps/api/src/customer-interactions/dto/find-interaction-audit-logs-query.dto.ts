import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { AuditAction } from "@prisma/client";

export class FindInteractionAuditLogsQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(["asc", "desc"])
  orderDirection?: "asc" | "desc";
}
