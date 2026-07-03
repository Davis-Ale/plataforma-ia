import { IsEnum, IsOptional, IsString } from "class-validator";
import { CustomerInteractionType } from "@prisma/client";

export class FindCustomerInteractionsQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsEnum(CustomerInteractionType)
  type?: CustomerInteractionType;
}
