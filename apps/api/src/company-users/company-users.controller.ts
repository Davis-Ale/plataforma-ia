import { Body, Controller, Get, Post } from "@nestjs/common";
import { CompanyUsersService } from "./company-users.service";
import { CreateCompanyUserDto } from "./dto/create-company-user.dto";

@Controller("company-users")
export class CompanyUsersController {
  constructor(private readonly companyUsersService: CompanyUsersService) {}

  @Post()
  async create(@Body() data: CreateCompanyUserDto) {
    return this.companyUsersService.create(data);
  }

  @Get()
  async findAll() {
    return this.companyUsersService.findAll();
  }
}
