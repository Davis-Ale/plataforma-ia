import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { FindWorkflowRunsQueryDto } from "./dto/find-workflow-runs-query.dto";
import { WorkflowsService } from "./workflows.service";

@Controller("workflows")
@UseGuards(
  JwtAuthGuard,
  CompanyContextGuard,
)
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
  ) {}

  @Get()
  findAll(
    @CurrentCompany() company: AuthenticatedCompany,
    @Query() query: FindWorkflowRunsQueryDto,
  ) {
    return this.workflowsService.findAll(
      company.companyId,
      query,
    );
  }

  @Get(":id")
  findOne(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("id") id: string,
  ) {
    return this.workflowsService.findOne(
      company.companyId,
      id,
    );
  }
}
