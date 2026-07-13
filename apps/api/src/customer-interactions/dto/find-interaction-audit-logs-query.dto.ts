import { IsOptional, IsString } from "class-validator";

export class FindInteractionAuditLogsQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
