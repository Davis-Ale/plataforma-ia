import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";

@Injectable()
export class CustomerInteractionsSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomerSummary(
    company: AuthenticatedCompany,
    customerId: string,
  ) {
    await this.ensureCustomerBelongsToCompany(company, customerId);

    const { now, startOfDay, endOfDay } = this.getDayRange();

    const baseWhere: Prisma.CustomerInteractionWhereInput = {
      companyId: company.companyId,
      customerId,
    };

    const [total, pending, completed, overdue, today, scheduled] =
      await Promise.all([
        this.prisma.customerInteraction.count({
          where: baseWhere,
        }),
        this.prisma.customerInteraction.count({
          where: {
            ...baseWhere,
            completedAt: null,
          },
        }),
        this.prisma.customerInteraction.count({
          where: {
            ...baseWhere,
            completedAt: {
              not: null,
            },
          },
        }),
        this.prisma.customerInteraction.count({
          where: {
            ...baseWhere,
            completedAt: null,
            scheduledAt: {
              lt: now,
            },
          },
        }),
        this.prisma.customerInteraction.count({
          where: {
            ...baseWhere,
            completedAt: null,
            scheduledAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        }),
        this.prisma.customerInteraction.count({
          where: {
            ...baseWhere,
            scheduledAt: {
              not: null,
            },
          },
        }),
      ]);

    return {
      total,
      pending,
      completed,
      overdue,
      today,
      scheduled,
    };
  }

  async getCompanySummary(company: AuthenticatedCompany) {
    const { now, startOfDay, endOfDay } = this.getDayRange();

    const baseWhere: Prisma.CustomerInteractionWhereInput = {
      companyId: company.companyId,
    };

    const [total, pending, completed, overdue, today] = await Promise.all([
      this.prisma.customerInteraction.count({
        where: baseWhere,
      }),
      this.prisma.customerInteraction.count({
        where: {
          ...baseWhere,
          completedAt: null,
        },
      }),
      this.prisma.customerInteraction.count({
        where: {
          ...baseWhere,
          completedAt: {
            not: null,
          },
        },
      }),
      this.prisma.customerInteraction.count({
        where: {
          ...baseWhere,
          completedAt: null,
          scheduledAt: {
            lt: now,
          },
        },
      }),
      this.prisma.customerInteraction.count({
        where: {
          ...baseWhere,
          completedAt: null,
          scheduledAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      }),
    ]);

    return {
      total,
      pending,
      completed,
      overdue,
      today,
    };
  }

  private getDayRange() {
    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return {
      now,
      startOfDay,
      endOfDay,
    };
  }

  private async ensureCustomerBelongsToCompany(
    company: AuthenticatedCompany,
    customerId: string,
  ) {
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
}
