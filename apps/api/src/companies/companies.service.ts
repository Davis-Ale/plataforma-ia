import { Injectable } from "@nestjs/common";
import { PrismaService } from "@plataforma/database";
import { CreateCompanyDto } from "./dto/create-company.dto";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCompanyDto) {
    return this.prisma.company.create({
      data: {
        name: data.name,
        legalName: data.legalName,
        document: data.document,
      },
    });
  }

  async findAll() {
    return this.prisma.company.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
