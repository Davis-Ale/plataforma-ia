import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateCompanyDto {
  @IsString()
  @MinLength(2)
  declare name: string;

  @IsOptional()
  @IsString()
  declare legalName?: string;

  @IsOptional()
  @IsString()
  declare document?: string;
}
