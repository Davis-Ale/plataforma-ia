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
import { AbsencesService } from "./absences.service";
import { CreateAbsenceDto } from "./dto/create-absence.dto";
import { FindAbsencesQueryDto } from "./dto/find-absences-query.dto";
import { UpdateAbsenceDto } from "./dto/update-absence.dto";

@Controller("absences")
@UseGuards(
  JwtAuthGuard,
  CompanyContextGuard,
  CompanyRolesGuard,
)
export class AbsencesController {
  constructor(
    private readonly absencesService: AbsencesService,
  ) {}

  @Post()
  @CompanyRoles(
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
  )
  create(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: CreateAbsenceDto,
  ) {
    return this.absencesService.create(
      company,
      user,
      data,
    );
  }

  @Get()
  findAll(
    @CurrentCompany() company: AuthenticatedCompany,
    @Query() query: FindAbsencesQueryDto,
  ) {
    return this.absencesService.findAll(
      company,
      query,
    );
  }

  @Get(":id")
  findOne(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("id") id: string,
  ) {
    return this.absencesService.findOne(
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
    @Body() data: UpdateAbsenceDto,
  ) {
    return this.absencesService.update(
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
    return this.absencesService.remove(
      company,
      user,
      id,
    );
  }
}
