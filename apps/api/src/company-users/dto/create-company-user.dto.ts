import { CompanyUserRole } from "@prisma/client";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

export class CreateCompanyUserDto {
  @IsUUID()
  declare companyId: string;

  @IsUUID()
  declare userId: string;

  @IsOptional()
  @IsEnum(CompanyUserRole)
  declare role?: CompanyUserRole;
}
