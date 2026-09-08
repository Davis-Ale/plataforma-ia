import { RequestStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateRequestDto {
  @IsEnum(RequestStatus)
  declare status: RequestStatus;
}
