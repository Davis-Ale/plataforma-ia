import { ContractStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class FindContractsQueryDto {
  @IsOptional()
  @IsString()
  declare page?: string;

  @IsOptional()
  @IsString()
  declare limit?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  declare status?: ContractStatus;

  @IsOptional()
  @IsUUID()
  declare employeeId?: string;

  @IsOptional()
  @IsUUID()
  declare positionId?: string;

  @IsOptional()
  @IsString()
  declare employmentType?: string;

  @IsOptional()
  @IsString()
  declare unit?: string;

  @IsOptional()
  @IsString()
  declare workRegime?: string;
}
