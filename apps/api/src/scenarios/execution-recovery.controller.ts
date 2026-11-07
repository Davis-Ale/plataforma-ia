import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CurrentSession } from "../auth/decorators/current-session.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExecutionIntegrityService } from "./execution-integrity.service";
import { PrepareOperationService } from "./prepare-operation.service";

@Controller("workflows")
@UseGuards(JwtAuthGuard, CompanyContextGuard)
export class ExecutionRecoveryController {
  constructor(private readonly integrity: ExecutionIntegrityService, private readonly scenario: PrepareOperationService) {}

  @Post(":id/inspect")
  inspect(@CurrentCompany() company: AuthenticatedCompany, @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string | undefined, @Param("id") id: string) {
    return this.integrity.inspect({ companyId: company.companyId, userId: user.id, sessionId: sessionId ?? "" }, id);
  }

  @Post(":id/resume")
  resume(@CurrentCompany() company: AuthenticatedCompany, @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string | undefined, @Param("id") id: string) {
    return this.scenario.resume({ companyId: company.companyId, userId: user.id, sessionId: sessionId ?? "" }, id);
  }
}
