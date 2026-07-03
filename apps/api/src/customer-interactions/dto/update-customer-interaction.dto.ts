import { IsDateString, IsIn, IsOptional, IsString, MinLength } from "class-validator";

const CUSTOMER_INTERACTION_TYPES = ["NOTE", "CALL", "WHATSAPP", "EMAIL", "MEETING", "FOLLOW_UP"] as const;

export type CustomerInteractionTypeInput = (typeof CUSTOMER_INTERACTION_TYPES)[number];

export class UpdateCustomerInteractionDto {
  @IsOptional()
  @IsIn(CUSTOMER_INTERACTION_TYPES)
  type?: CustomerInteractionTypeInput;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}
