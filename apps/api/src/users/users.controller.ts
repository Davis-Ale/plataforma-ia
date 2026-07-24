import {
  Body,
  Controller,
  Get,
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
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(
  JwtAuthGuard,
  CompanyContextGuard,
  CompanyRolesGuard,
)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @CompanyRoles(
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
  )
  async create(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: CreateUserDto,
  ) {
    return this.usersService.create(
      company.companyId,
      user.id,
      data,
    );
  }

  @Get()
  @CompanyRoles(
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
  )
  async findAll(
    @CurrentCompany() company: AuthenticatedCompany,
  ) {
    return this.usersService.findAll(
      company.companyId,
    );
  }
}
