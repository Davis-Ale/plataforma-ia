import { AbsenceStatus, AbsenceType } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";

export class UpdateAbsenceDto {
  @IsOptional()
  @IsUUID()
  declare employeeId?: string;

  @IsOptional()
  @IsEnum(AbsenceType)
  declare type?: AbsenceType;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare startDate?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  declare reason?: string;

  @IsOptional()
  @IsEnum(AbsenceStatus)
  declare status?: AbsenceStatus;
}
