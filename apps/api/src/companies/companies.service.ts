import { Injectable } from "@nestjs/common";
import {
  CompanyUserRole,
  CompanyUserStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { CreateCompanyDto } from "./dto/create-company.dto";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    data: CreateCompanyDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const company = await transaction.company.create({
        data: {
          name: data.name,
          legalName: data.legalName,
          document: data.document,
        },
      });

      await transaction.companyUser.create({
        data: {
          companyId: company.id,
          userId,
          role: CompanyUserRole.OWNER,
          status: CompanyUserStatus.ACTIVE,
        },
      });

      return company;
    });
  }

  async findAll(userId: string) {
    return this.prisma.company.findMany({
      where: {
        users: {
          some: {
            userId,
            status: CompanyUserStatus.ACTIVE,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
