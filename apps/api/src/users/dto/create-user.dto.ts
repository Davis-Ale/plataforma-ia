import { IsEmail, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  declare name: string;

  @IsEmail()
  declare email: string;
}
