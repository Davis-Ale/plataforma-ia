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

export class UpdateContractDto {
  @IsOptional()
  @IsUUID()
  declare employeeId?: string;

  @IsOptional()
  @IsUUID()
  declare positionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare employmentType?: string;

  @IsOptional()
  @IsDateString()
  declare admissionDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare unit?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare workRegime?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  declare status?: ContractStatus;
}
