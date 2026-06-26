import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";

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
  async findAll(@CurrentCompany() company: AuthenticatedCompany) {
    return this.customersService.findAll(company);
  }
}
