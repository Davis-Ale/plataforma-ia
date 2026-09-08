import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CompanyUserRole } from "@prisma/client";
import { CompanyRoles } from "../auth/decorators/company-roles.decorator";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { CompanyRolesGuard } from "../auth/guards/company-roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateRequestDto } from "./dto/create-request.dto";
import { FindRequestsQueryDto } from "./dto/find-requests-query.dto";
import { UpdateRequestDto } from "./dto/update-request.dto";
import { RequestsService } from "./requests.service";

@Controller("requests")
@UseGuards(
  JwtAuthGuard,
  CompanyContextGuard,
  CompanyRolesGuard,
)
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
  ) {}

  @Post()
  create(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: CreateRequestDto,
  ) {
    return this.requestsService.create(
      company,
      user,
      data,
    );
  }

  @Get()
  findAll(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindRequestsQueryDto,
  ) {
    return this.requestsService.findAll(
      company,
      user,
      query,
    );
  }

  @Get(":id")
  findOne(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.requestsService.findOne(
      company,
      user,
      id,
    );
  }

  @Patch(":id")
  @CompanyRoles(
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
  )
  update(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() data: UpdateRequestDto,
  ) {
    return this.requestsService.update(
      company,
      user,
      id,
      data,
    );
  }
}
