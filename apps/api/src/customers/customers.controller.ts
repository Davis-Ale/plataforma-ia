import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { FindCustomersQueryDto } from "./dto/find-customers-query.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Controller("customers")
@UseGuards(JwtAuthGuard, CompanyContextGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  async create(
    @CurrentCompany() company: AuthenticatedCompany,
    @Body() data: CreateCustomerDto,
  ) {
    return this.customersService.create(company, data);
  }

  @Get()
  async findAll(
    @CurrentCompany() company: AuthenticatedCompany,
    @Query() query: FindCustomersQueryDto,
  ) {
    return this.customersService.findAll(company, query);
  }

  @Get(":id")
  async findOne(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("id") id: string,
  ) {
    return this.customersService.findOne(company, id);
  }

  @Patch(":id")
  async update(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("id") id: string,
    @Body() data: UpdateCustomerDto,
  ) {
    return this.customersService.update(company, id, data);
  }

  @Delete(":id")
  async archive(
    @CurrentCompany() company: AuthenticatedCompany,
    @Param("id") id: string,
  ) {
    return this.customersService.archive(company, id);
  }
}
