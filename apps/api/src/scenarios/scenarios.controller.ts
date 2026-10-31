import {
  Body,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CurrentSession } from "../auth/decorators/current-session.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PrepareOperationDto } from "./dto/prepare-operation.dto";
import { PrepareOperationService } from "./prepare-operation.service";

@Controller("scenarios")
@UseGuards(
  JwtAuthGuard,
  CompanyContextGuard,
)
export class ScenariosController {
  constructor(
    private readonly prepareOperation: PrepareOperationService,
  ) {}

  @Post("operations/prepare-from-contract")
  prepareFromContract(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string | undefined,
    @Body() data: PrepareOperationDto,
  ) {
    return this.prepareOperation.run(
      {
        companyId: company.companyId,
        userId: user.id,
        sessionId: typeof sessionId === "string" ? sessionId : "",
      },
      {
        contractExternalRef: data.contractExternalRef,
        operationId: data.operationId,
      },
    );
  }
}
