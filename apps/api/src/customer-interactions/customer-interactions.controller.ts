import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CustomerInteractionsService } from "./customer-interactions.service";
import { CreateCustomerInteractionDto } from "./dto/create-customer-interaction.dto";
import { FindCustomerInteractionsQueryDto } from "./dto/find-customer-interactions-query.dto";
import { UpdateCustomerInteractionDto } from "./dto/update-customer-interaction.dto";

@Controller("customers/:customerId/interactions")
@UseGuards(JwtAuthGuard, CompanyContextGuard)
export class CustomerInteractionsController {
  constructor(private readonly customerInteractionsService: CustomerInteractionsService) {}

  @Post()
  async create(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Param("customerId") customerId: string,
    @Body() data: CreateCustomerInteractionDto,
  ) {
    return this.customerInteractionsService.create(company, user, customerId, data);
  }

  @Patch(":id")
  async update(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Param("customerId") customerId: string,
    @Param("id") id: string,
    @Body() data: UpdateCustomerInteractionDto,
  ) {
    return this.customerInteractionsService.update(company, user, customerId, id, data);
  }

  @Post(":id/complete")
  async complete(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Param("customerId") customerId: string,
    @Param("id") id: string,
  ) {
    return this.customerInteractionsService.complete(company, user, customerId, id);
  }

  @Post(":id/reopen")
  async reopen(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Param("customerId") customerId: string,
    @Param("id") id: string,
  ) {
    return this.customerInteractionsService.reopen(company, user, customerId, id);
  }

  @Delete(":id")
  async remove(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @Param("customerId") customerId: string,
    @Param("id") id: string,
  ) {
    return this.customerInteractionsService.remove(company, user, customerId, id);
  }

  @Get(":id")
  async findOne(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("customerId") customerId: string,
    @Param("id") id: string,
  ) {
    return this.customerInteractionsService.findOne(company, customerId, id);
  }

  @Get()
  async findAll(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("customerId") customerId: string,
    @Query() query: FindCustomerInteractionsQueryDto,
  ) {
    return this.customerInteractionsService.findAll(company, customerId, query);
  }
}


@Controller("customer-interactions")
@UseGuards(JwtAuthGuard, CompanyContextGuard)
export class CompanyCustomerInteractionsController {
  constructor(private readonly customerInteractionsService: CustomerInteractionsService) {}

  @Get("today")
  async findToday(@CurrentCompany() company: AuthenticatedCompany) {
    return this.customerInteractionsService.findToday(company);
  }

  @Get("overdue")
  async findOverdue(@CurrentCompany() company: AuthenticatedCompany) {
    return this.customerInteractionsService.findOverdue(company);
  }

  @Get("pending")
  async findPending(@CurrentCompany() company: AuthenticatedCompany) {
    return this.customerInteractionsService.findPending(company);
  }
}
