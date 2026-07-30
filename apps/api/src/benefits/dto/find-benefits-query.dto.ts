import {
  BenefitStatus,
  BenefitType,
} from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsUUID,
} from "class-validator";

export class FindBenefitsQueryDto {
  @IsOptional()
  @IsUUID()
  declare employeeId?: string;

  @IsOptional()
  @IsEnum(BenefitType)
  declare type?: BenefitType;

  @IsOptional()
  @IsEnum(BenefitStatus)
  declare status?: BenefitStatus;
}
