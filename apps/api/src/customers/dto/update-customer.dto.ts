import { CustomerStatus } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  declare name?: string;

  @IsOptional()
  @IsEmail()
  declare email?: string;

  @IsOptional()
  @IsString()
  declare phone?: string;

  @IsOptional()
  @IsString()
  declare document?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  declare status?: CustomerStatus;
}
