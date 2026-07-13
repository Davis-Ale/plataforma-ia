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
  customerId?: string;

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
}
