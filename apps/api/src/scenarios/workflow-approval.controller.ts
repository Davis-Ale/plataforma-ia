import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CurrentSession } from "../auth/decorators/current-session.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DecideWorkflowApprovalDto, FindWorkflowApprovalsDto } from "./dto/workflow-approval.dto";
import { WorkflowApprovalService } from "./workflow-approval.service";

@Controller("approvals/executions")
@UseGuards(JwtAuthGuard, CompanyContextGuard)
export class WorkflowApprovalController {
  constructor(private readonly approvals: WorkflowApprovalService) {}

  @Get()
  list(@CurrentCompany() company: AuthenticatedCompany, @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string | undefined, @Query() query: FindWorkflowApprovalsDto) {
    return this.approvals.list({ companyId: company.companyId, userId: user.id, sessionId: sessionId ?? "" }, query.page, query.status);
  }

  @Post(":id/decision")
  @HttpCode(200)
  decide(@CurrentCompany() company: AuthenticatedCompany, @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string | undefined, @Param("id") id: string, @Body() data: DecideWorkflowApprovalDto) {
    return this.approvals.decide({ companyId: company.companyId, userId: user.id, sessionId: sessionId ?? "" }, id, data.decision, data.reviewToken);
  }
}
