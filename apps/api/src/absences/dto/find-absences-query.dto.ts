import { AbsenceStatus, AbsenceType } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from "class-validator";

export class FindAbsencesQueryDto {
  @IsOptional()
  @IsString()
  declare page?: string;

  @IsOptional()
  @IsString()
  declare limit?: string;

  @IsOptional()
  @IsUUID()
  declare employeeId?: string;

  @IsOptional()
  @IsEnum(AbsenceType)
  declare type?: AbsenceType;

  @IsOptional()
  @IsEnum(AbsenceStatus)
  declare status?: AbsenceStatus;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare startDate?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare endDate?: string;
}
