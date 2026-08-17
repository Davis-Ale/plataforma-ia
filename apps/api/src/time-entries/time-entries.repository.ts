import { Injectable } from "@nestjs/common";
import {
  EmployeeStatus,
  Prisma,
  TimeEntryStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { FindTimeEntriesQueryDto } from "./dto/find-time-entries-query.dto";

export type CreateTimeEntryData = {
  employeeId: string;
  workDate: Date;
  clockIn?: Date;
  clockOut?: Date;
  workedMinutes: number;
  lateMinutes: number;
  balanceMinutes: number;
  status: TimeEntryStatus;
};

export type UpdateTimeEntryData = {
  employeeId?: string;
  workDate?: Date;
  clockIn?: Date;
  clockOut?: Date;
  workedMinutes?: number;
  lateMinutes?: number;
  balanceMinutes?: number;
  status?: TimeEntryStatus;
};

@Injectable()
export class TimeEntriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    companyId: string,
    data: CreateTimeEntryData,
  ) {
    return this.prisma.timeEntry.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        workDate: data.workDate,
        clockIn: data.clockIn,
        clockOut: data.clockOut,
        workedMinutes: data.workedMinutes,
        lateMinutes: data.lateMinutes,
        balanceMinutes: data.balanceMinutes,
        status: data.status,
      },
      include: {
        employee: true,
      },
    });
  }

  findMany(
    companyId: string,
    query: FindTimeEntriesQueryDto,
    skip: number,
    take: number,
  ) {
    const where = this.buildWhere(companyId, query);

    return Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        include: {
          employee: true,
        },
        orderBy: [
          {
            workDate: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip,
        take,
      }),
      this.prisma.timeEntry.count({
        where,
      }),
    ]);
  }

  findOne(
    companyId: string,
    id: string,
  ) {
    return this.prisma.timeEntry.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        employee: true,
      },
    });
  }

  update(
    companyId: string,
    id: string,
    data: UpdateTimeEntryData,
  ) {
    return this.prisma.timeEntry.updateMany({
      where: {
        id,
        companyId,
      },
      data,
    });
  }

  remove(
    companyId: string,
    id: string,
  ) {
    return this.prisma.timeEntry.deleteMany({
      where: {
        id,
        companyId,
      },
    });
  }

  findEmployee(
    companyId: string,
    employeeId: string,
  ) {
    return this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        companyId,
        status: {
          not: EmployeeStatus.ARCHIVED,
        },
      },
      select: {
        id: true,
      },
    });
  }

  private buildWhere(
    companyId: string,
    query: FindTimeEntriesQueryDto,
  ): Prisma.TimeEntryWhereInput {
    return {
      companyId,
      employeeId: query.employeeId,
      status: query.status,
      workDate:
        query.startDate !== undefined ||
        query.endDate !== undefined
          ? {
              gte:
                query.startDate === undefined
                  ? undefined
                  : new Date(query.startDate),
              lte:
                query.endDate === undefined
                  ? undefined
                  : new Date(query.endDate),
            }
          : undefined,
    };
  }
}
