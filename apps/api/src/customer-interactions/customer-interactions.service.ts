import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateCustomerInteractionDto } from "./dto/create-customer-interaction.dto";
import { FindCustomerInteractionsQueryDto } from "./dto/find-customer-interactions-query.dto";

@Injectable()
export class CustomerInteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    customerId: string,
    data: CreateCustomerInteractionDto,
  ) {
    await this.ensureCustomerBelongsToCompany(company, customerId);

    const interaction = await this.prisma.customerInteraction.create({
      data: {
        companyId: company.companyId,
        customerId,
        userId: user.id,
        type: data.type,
        content: data.content,
        scheduledAt: data.scheduledAt !== undefined ? new Date(data.scheduledAt) : undefined,
        completedAt: data.completedAt !== undefined ? new Date(data.completedAt) : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "customer_interaction",
      resourceId: interaction.id,
      metadata: {
        customerId,
        type: interaction.type,
      },
    });

    return interaction;
  }

  async findOne(company: AuthenticatedCompany, customerId: string, id: string) {
    await this.ensureCustomerBelongsToCompany(company, customerId);

    const interaction = await this.prisma.customerInteraction.findFirst({
      where: {
        id,
        companyId: company.companyId,
        customerId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (interaction === null) {
      throw new NotFoundException("Customer interaction not found");
    }

    return interaction;
  }

  async findAll(
    company: AuthenticatedCompany,
    customerId: string,
    query: FindCustomerInteractionsQueryDto,
  ) {
    await this.ensureCustomerBelongsToCompany(company, customerId);

    const page = this.toPositiveNumber(query.page, 1);
    const limit = this.toPositiveNumber(query.limit, 20);
    const safeLimit = Math.min(limit, 100);
    const skip = (page - 1) * safeLimit;

    const where: Prisma.CustomerInteractionWhereInput = {
      companyId: company.companyId,
      customerId,
      type: query.type,
    };

    const [items, total] = await Promise.all([
      this.prisma.customerInteraction.findMany({
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
      this.prisma.customerInteraction.count({ where }),
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

  private async ensureCustomerBelongsToCompany(company: AuthenticatedCompany, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        companyId: company.companyId,
      },
      select: {
        id: true,
      },
    });

    if (customer === null) {
      throw new NotFoundException("Customer not found");
    }
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
