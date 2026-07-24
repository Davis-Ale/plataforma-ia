import { Injectable } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuditService } from "../audit/audit.service";
import { CreateCompanyUserDto } from "./dto/create-company-user.dto";

@Injectable()
export class CompanyUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    companyId: string,
    actorUserId: string,
    data: CreateCompanyUserDto,
  ) {
    const membership =
      await this.prisma.companyUser.create({
        data: {
          companyId,
          userId: data.userId,
          role: data.role,
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
            },
          },
        },
      });

    await this.auditService.create({
      companyId,
      userId: actorUserId,
      action: AuditAction.CREATE,
      resource: "company_user",
      resourceId: membership.id,
      metadata: {
        userId: membership.userId,
        role: membership.role,
      },
    });

    return membership;
  }

  async findAll(companyId: string) {
    return this.prisma.companyUser.findMany({
      where: {
        companyId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });
  }
}
