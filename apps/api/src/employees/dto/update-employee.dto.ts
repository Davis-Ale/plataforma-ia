import { EmployeeStatus } from "@prisma/client";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare name?: string;

  @IsOptional()
  @IsString()
  @MinLength(11)
  @MaxLength(14)
  declare cpf?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  declare email?: string;

  @IsOptional()
  @IsUUID()
  declare departmentId?: string;

  @IsOptional()
  @IsUUID()
  declare positionId?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  declare status?: EmployeeStatus;
}
