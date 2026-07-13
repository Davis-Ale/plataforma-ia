import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { CustomerInteractionType } from "@prisma/client";

export class FindCompanyCustomerInteractionsQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(CustomerInteractionType)
  type?: CustomerInteractionType;

  @IsOptional()
  @IsIn(["PENDING", "COMPLETED"])
  status?: "PENDING" | "COMPLETED";

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  scheduledStartDate?: string;

  @IsOptional()
  @IsDateString()
  scheduledEndDate?: string;

  @IsOptional()
  @IsDateString()
  completedStartDate?: string;

  @IsOptional()
  @IsDateString()
  completedEndDate?: string;

  @IsOptional()
  @IsIn(["createdAt", "scheduledAt"])
  orderBy?: "createdAt" | "scheduledAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  orderDirection?: "asc" | "desc";
}
