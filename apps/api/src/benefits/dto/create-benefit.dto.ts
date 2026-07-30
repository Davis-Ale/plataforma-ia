import {
  BenefitStatus,
  BenefitType,
} from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsUUID,
} from "class-validator";

export class CreateBenefitDto {
  @IsUUID()
  declare employeeId: string;

  @IsEnum(BenefitType)
  declare type: BenefitType;

  @IsOptional()
  @IsEnum(BenefitStatus)
  declare status?: BenefitStatus;
}
