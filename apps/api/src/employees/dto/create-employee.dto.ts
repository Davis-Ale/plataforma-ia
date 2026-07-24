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

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare name: string;

  @IsString()
  @MinLength(11)
  @MaxLength(14)
  declare cpf: string;

  @IsEmail()
  @MaxLength(160)
  declare email: string;

  @IsUUID()
  declare departmentId: string;

  @IsUUID()
  declare positionId: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  declare status?: EmployeeStatus;
}
