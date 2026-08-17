import { TimeEntryStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from "class-validator";

export class UpdateTimeEntryDto {
  @IsOptional()
  @IsUUID()
  declare employeeId?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare workDate?: string;

  @IsOptional()
  @IsDateString()
  declare clockIn?: string;

  @IsOptional()
  @IsDateString()
  declare clockOut?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  declare workedMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  declare lateMinutes?: number;

  @IsOptional()
  @IsInt()
  declare balanceMinutes?: number;

  @IsOptional()
  @IsEnum(TimeEntryStatus)
  declare status?: TimeEntryStatus;
}
