import { Injectable } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { FindAuditLogsQueryDto } from "./dto/find-audit-logs-query.dto";

export type CreateAuditLogInput = {
  companyId: string;
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        metadata: input.metadata,
      },
    });
  }

  async findAll(company: AuthenticatedCompany, query: FindAuditLogsQueryDto) {
    const page = this.toPositiveNumber(query.page, 1);
    const limit = this.toPositiveNumber(query.limit, 20);
    const safeLimit = Math.min(limit, 100);
    const skip = (page - 1) * safeLimit;

    const where: Prisma.AuditLogWhereInput = {
      companyId: company.companyId,
      action: query.action,
      resource: query.resource,
      resourceId: query.resourceId,
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: safeLimit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  private toPositiveNumber(value: string | undefined, fallback: number) {
    if (value === undefined) {
      return fallback;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed) || parsed < 1) {
      return fallback;
    }

    return Math.floor(parsed);
  }
}
