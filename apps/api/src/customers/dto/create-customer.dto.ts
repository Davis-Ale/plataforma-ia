import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  declare name: string;

  @IsOptional()
  @IsEmail()
  declare email?: string;

  @IsOptional()
  @IsString()
  declare phone?: string;

  @IsOptional()
  @IsString()
  declare document?: string;
}
