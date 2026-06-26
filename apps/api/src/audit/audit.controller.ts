import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuditService } from "./audit.service";
import { FindAuditLogsQueryDto } from "./dto/find-audit-logs-query.dto";

@Controller("audit-logs")
@UseGuards(JwtAuthGuard, CompanyContextGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(
    @CurrentCompany() company: AuthenticatedCompany,
    @Query() query: FindAuditLogsQueryDto,
  ) {
    return this.auditService.findAll(company, query);
  }
}
