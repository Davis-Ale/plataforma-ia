import { Injectable } from "@nestjs/common";
import { PrismaService } from "@plataforma/database";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(company: AuthenticatedCompany, data: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        companyId: company.companyId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        document: data.document,
      },
    });
  }

  async findAll(company: AuthenticatedCompany) {
    return this.prisma.customer.findMany({
      where: {
        companyId: company.companyId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
