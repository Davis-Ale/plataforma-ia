import { RequestStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

export class FindRequestsQueryDto {
  @IsOptional()
  @IsString()
  declare page?: string;

  @IsOptional()
  @IsString()
  declare limit?: string;

  @IsOptional()
  @IsEnum(RequestStatus)
  declare status?: RequestStatus;
}
