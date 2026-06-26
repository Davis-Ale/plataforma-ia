import { IsEnum, IsOptional, IsString } from "class-validator";
import { AuditAction } from "@prisma/client";

export class FindAuditLogsQueryDto {
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
  @IsString()
  resource?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;
}
