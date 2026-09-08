import {
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  declare title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  declare description: string;
}
