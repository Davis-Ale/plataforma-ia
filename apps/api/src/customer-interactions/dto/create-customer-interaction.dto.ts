import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { CustomerInteractionType } from "@prisma/client";

export class CreateCustomerInteractionDto {
  @IsEnum(CustomerInteractionType)
  declare type: CustomerInteractionType;

  @IsString()
  @MinLength(1)
  declare content: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}
