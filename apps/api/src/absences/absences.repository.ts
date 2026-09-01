import { Injectable } from "@nestjs/common";
import {
  AbsenceStatus,
  AbsenceType,
  EmployeeStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { FindAbsencesQueryDto } from "./dto/find-absences-query.dto";

export type CreateAbsenceData = {
  employeeId: string;
  type: AbsenceType;
  startDate: Date;
  endDate: Date;
  reason?: string;
  status: AbsenceStatus;
};

export type UpdateAbsenceData = {
  employeeId?: string;
  type?: AbsenceType;
  startDate?: Date;
  endDate?: Date;
  reason?: string;
  status?: AbsenceStatus;
};

@Injectable()
export class AbsencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(companyId: string, data: CreateAbsenceData) {
    return this.prisma.absence.create({
      data: {
        companyId,
        ...data,
      },
      include: {
        employee: true,
      },
    });
  }

  findMany(
    companyId: string,
    query: FindAbsencesQueryDto,
    skip: number,
    take: number,
  ) {
    const where = this.buildWhere(companyId, query);

    return Promise.all([
      this.prisma.absence.findMany({
        where,
        include: {
          employee: true,
        },
        orderBy: [
          { startDate: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take,
      }),
      this.prisma.absence.count({ where }),
    ]);
  }

  findOne(companyId: string, id: string) {
    return this.prisma.absence.findFirst({
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
    data: UpdateAbsenceData,
  ) {
    return this.prisma.absence.updateMany({
      where: {
        id,
        companyId,
      },
      data,
    });
  }

  remove(companyId: string, id: string) {
    return this.prisma.absence.deleteMany({
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
    query: FindAbsencesQueryDto,
  ): Prisma.AbsenceWhereInput {
    const period =
      query.startDate !== undefined ||
      query.endDate !== undefined
        ? {
            startDate:
              query.endDate === undefined
                ? undefined
                : {
                    lte: new Date(
                      query.endDate + "T00:00:00.000Z",
                    ),
                  },
            endDate:
              query.startDate === undefined
                ? undefined
                : {
                    gte: new Date(
                      query.startDate + "T00:00:00.000Z",
                    ),
                  },
          }
        : {};

    return {
      companyId,
      employeeId: query.employeeId,
      type: query.type,
      status: query.status,
      ...period,
    };
  }
}
