import { Injectable } from "@nestjs/common";
import {
  BenefitStatus,
  BenefitType,
  EmployeeStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { FindBenefitsQueryDto } from "./dto/find-benefits-query.dto";

export type CreateBenefitData = {
  employeeId: string;
  type: BenefitType;
  status: BenefitStatus;
};

export type UpdateBenefitData = {
  employeeId?: string;
  type?: BenefitType;
  status?: BenefitStatus;
};

@Injectable()
export class BenefitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    companyId: string,
    data: CreateBenefitData,
  ) {
    return this.prisma.benefit.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        type: data.type,
        status: data.status,
      },
      include: {
        employee: true,
      },
    });
  }

  findAll(
    companyId: string,
    query: FindBenefitsQueryDto,
  ) {
    return this.prisma.benefit.findMany({
      where: {
        companyId,
        employeeId: query.employeeId,
        type: query.type,
        status: query.status,
      },
      include: {
        employee: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  findOne(
    companyId: string,
    id: string,
  ) {
    return this.prisma.benefit.findFirst({
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
    data: UpdateBenefitData,
  ) {
    return this.prisma.benefit.updateMany({
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
    return this.prisma.benefit.deleteMany({
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
}
