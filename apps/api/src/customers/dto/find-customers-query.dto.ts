import { IsOptional, IsString } from "class-validator";

export class FindCustomersQueryDto {
  @IsOptional()
  @IsString()
  declare search?: string;

  @IsOptional()
  @IsString()
  declare page?: string;

  @IsOptional()
  @IsString()
  declare limit?: string;
}
