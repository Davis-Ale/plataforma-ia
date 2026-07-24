import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CompanyUserRole } from "@prisma/client";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CompanyRoles } from "../auth/decorators/company-roles.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { CompanyRolesGuard } from "../auth/guards/company-roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuditService } from "./audit.service";
import { FindAuditLogsQueryDto } from "./dto/find-audit-logs-query.dto";

@Controller("audit-logs")
@UseGuards(
  JwtAuthGuard,
  CompanyContextGuard,
  CompanyRolesGuard,
)
@CompanyRoles(
  CompanyUserRole.OWNER,
  CompanyUserRole.ADMIN,
)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async findAll(
    @CurrentCompany() company: AuthenticatedCompany,
    @Query() query: FindAuditLogsQueryDto,
  ) {
    return this.auditService.findAll(company, query);
  }

  @Get(":id")
  async findOne(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("id") id: string,
  ) {
    return this.auditService.findOne(company, id);
  }
}
