import { ContractStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateContractDto {
  @IsUUID()
  declare employeeId: string;

  @IsUUID()
  declare positionId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare employmentType: string;

  @IsDateString()
  declare admissionDate: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare unit: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare workRegime: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  declare status?: ContractStatus;
}
