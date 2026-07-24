import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CompanyUserRole } from "@prisma/client";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CompanyRoles } from "../auth/decorators/company-roles.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { CompanyRolesGuard } from "../auth/guards/company-roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DepartmentsService } from "./departments.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@Controller("departments")
@UseGuards(
  JwtAuthGuard,
  CompanyContextGuard,
  CompanyRolesGuard,
)
export class DepartmentsController {
  constructor(
    private readonly departmentsService: DepartmentsService,
  ) {}

  @Post()
  @CompanyRoles(
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
  )
  create(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: CreateDepartmentDto,
  ) {
    return this.departmentsService.create(
      company,
      user,
      data,
    );
  }

  @Get()
  findAll(
    @CurrentCompany() company: AuthenticatedCompany,
  ) {
    return this.departmentsService.findAll(company);
  }

  @Get(":id")
  findOne(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("id") id: string,
  ) {
    return this.departmentsService.findOne(
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
    @Body() data: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(
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
    return this.departmentsService.remove(
      company,
      user,
      id,
    );
  }
}
