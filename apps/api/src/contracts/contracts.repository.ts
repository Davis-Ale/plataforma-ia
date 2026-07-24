import { Injectable } from "@nestjs/common";
import {
  ContractStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { FindContractsQueryDto } from "./dto/find-contracts-query.dto";

export type CreateContractData = {
  employeeId: string;
  positionId: string;
  employmentType: string;
  admissionDate: Date;
  unit: string;
  workRegime: string;
  status: ContractStatus;
};

export type UpdateContractData = {
  employeeId?: string;
  positionId?: string;
  employmentType?: string;
  admissionDate?: Date;
  unit?: string;
  workRegime?: string;
  status?: ContractStatus;
};

@Injectable()
export class ContractsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    companyId: string,
    data: CreateContractData,
  ) {
    return this.prisma.contract.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        positionId: data.positionId,
        employmentType: data.employmentType,
        admissionDate: data.admissionDate,
        unit: data.unit,
        workRegime: data.workRegime,
        status: data.status,
      },
      include: {
        employee: true,
        position: true,
      },
    });
  }

  findMany(
    companyId: string,
    query: FindContractsQueryDto,
    archived: boolean,
    skip: number,
    take: number,
  ) {
    const where = this.buildWhere(
      companyId,
      query,
      archived,
    );

    return Promise.all([
      this.prisma.contract.findMany({
        where,
        include: {
          employee: true,
          position: true,
        },
        orderBy: {
          admissionDate: "desc",
        },
        skip,
        take,
      }),
      this.prisma.contract.count({
        where,
      }),
    ]);
  }

  findOne(
    companyId: string,
    id: string,
  ) {
    return this.prisma.contract.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        employee: true,
        position: true,
      },
    });
  }

  update(
    companyId: string,
    id: string,
    data: UpdateContractData,
  ) {
    return this.prisma.contract.updateMany({
      where: {
        id,
        companyId,
        status: {
          not: ContractStatus.ARCHIVED,
        },
      },
      data,
    });
  }

  archive(
    companyId: string,
    id: string,
  ) {
    return this.prisma.contract.updateMany({
      where: {
        id,
        companyId,
        status: {
          not: ContractStatus.ARCHIVED,
        },
      },
      data: {
        status: ContractStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });
  }

  restore(
    companyId: string,
    id: string,
  ) {
    return this.prisma.contract.updateMany({
      where: {
        id,
        companyId,
        status: ContractStatus.ARCHIVED,
      },
      data: {
        status: ContractStatus.ACTIVE,
        archivedAt: null,
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
          not: "ARCHIVED",
        },
      },
      select: {
        id: true,
      },
    });
  }

  findPosition(
    companyId: string,
    positionId: string,
  ) {
    return this.prisma.position.findFirst({
      where: {
        id: positionId,
        companyId,
      },
      select: {
        id: true,
      },
    });
  }

  private buildWhere(
    companyId: string,
    query: FindContractsQueryDto,
    archived: boolean,
  ): Prisma.ContractWhereInput {
    return {
      companyId,
      status: archived
        ? ContractStatus.ARCHIVED
        : query.status !== undefined &&
            query.status !== ContractStatus.ARCHIVED
          ? query.status
          : {
              not: ContractStatus.ARCHIVED,
            },
      employeeId: query.employeeId,
      positionId: query.positionId,
      employmentType:
        query.employmentType?.trim(),
      unit: query.unit?.trim(),
      workRegime: query.workRegime?.trim(),
    };
  }
}
