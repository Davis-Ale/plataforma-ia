import { IsEnum, IsOptional, IsString } from "class-validator";
import { CustomerStatus } from "@prisma/client";

export class FindCustomersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
