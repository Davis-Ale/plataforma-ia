import { IsString, MinLength } from "class-validator";

export class RefreshTokenDto {
  @IsString()
  @MinLength(20)
  declare refreshToken: string;
}
