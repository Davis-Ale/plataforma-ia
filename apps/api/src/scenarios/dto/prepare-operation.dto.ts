import {
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class PrepareOperationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  declare contractExternalRef: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  declare operationId: string;
}
