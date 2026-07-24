import { Injectable } from "@nestjs/common";
import {
  AuditAction,
  CompanyUserRole,
  CompanyUserStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuditService } from "../audit/audit.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    userId: string,
    data: CreateCompanyDto,
  ) {
    const company = await this.prisma.$transaction(
      async (transaction) => {
        const createdCompany =
          await transaction.company.create({
            data: {
              name: data.name,
              legalName: data.legalName,
              document: data.document,
            },
          });

        await transaction.companyUser.create({
          data: {
            companyId: createdCompany.id,
            userId,
            role: CompanyUserRole.OWNER,
            status: CompanyUserStatus.ACTIVE,
          },
        });

        return createdCompany;
      },
    );

    await this.auditService.create({
      companyId: company.id,
      userId,
      action: AuditAction.CREATE,
      resource: "company",
      resourceId: company.id,
      metadata: {
        name: company.name,
      },
    });

    return company;
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
