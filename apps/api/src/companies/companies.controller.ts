import { Body, Controller, Get, Post } from "@nestjs/common";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  async create(@Body() data: CreateCompanyDto) {
    return this.companiesService.create(data);
  }

  @Get()
  async findAll() {
    return this.companiesService.findAll();
  }
}
