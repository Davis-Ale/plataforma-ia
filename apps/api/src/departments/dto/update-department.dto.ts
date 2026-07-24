import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  declare description?: string;
}
