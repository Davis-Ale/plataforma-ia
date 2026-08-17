import {
  Body,
  Controller,
  Delete,
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
import { CreateTimeEntryDto } from "./dto/create-time-entry.dto";
import { FindTimeEntriesQueryDto } from "./dto/find-time-entries-query.dto";
import { UpdateTimeEntryDto } from "./dto/update-time-entry.dto";
import { TimeEntriesService } from "./time-entries.service";

@Controller("time-entries")
@UseGuards(
  JwtAuthGuard,
  CompanyContextGuard,
  CompanyRolesGuard,
)
export class TimeEntriesController {
  constructor(
    private readonly timeEntriesService: TimeEntriesService,
  ) {}

  @Post()
  @CompanyRoles(
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
  )
  create(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: CreateTimeEntryDto,
  ) {
    return this.timeEntriesService.create(
      company,
      user,
      data,
    );
  }

  @Get()
  findAll(
    @CurrentCompany() company: AuthenticatedCompany,
    @Query() query: FindTimeEntriesQueryDto,
  ) {
    return this.timeEntriesService.findAll(
      company,
      query,
    );
  }

  @Get(":id")
  findOne(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("id") id: string,
  ) {
    return this.timeEntriesService.findOne(
      company,
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
    @Body() data: UpdateTimeEntryDto,
  ) {
    return this.timeEntriesService.update(
      company,
      user,
      id,
      data,
    );
  }

  @Delete(":id")
  @CompanyRoles(
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
  )
  remove(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.timeEntriesService.remove(
      company,
      user,
      id,
    );
  }
}
