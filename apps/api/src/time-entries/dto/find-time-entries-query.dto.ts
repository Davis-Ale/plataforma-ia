import { TimeEntryStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from "class-validator";

export class FindTimeEntriesQueryDto {
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
  @IsEnum(TimeEntryStatus)
  declare status?: TimeEntryStatus;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare startDate?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare endDate?: string;
}
