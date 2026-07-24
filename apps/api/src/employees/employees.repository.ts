import { Injectable } from "@nestjs/common";
import { EmployeeStatus } from "@prisma/client";
import { PrismaService } from "@plataforma/database";

export type CreateEmployeeData = {
  departmentId: string;
  positionId: string;
  name: string;
  cpf: string;
  email: string;
  status: EmployeeStatus;
};

export type UpdateEmployeeData = {
  departmentId?: string;
  positionId?: string;
  name?: string;
  cpf?: string;
  email?: string;
  status?: EmployeeStatus;
};

@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    companyId: string,
    data: CreateEmployeeData,
  ) {
    return this.prisma.employee.create({
      data: {
        companyId,
        departmentId: data.departmentId,
        positionId: data.positionId,
        name: data.name,
        cpf: data.cpf,
        email: data.email,
        status: data.status,
      },
      include: {
        department: true,
        position: true,
      },
    });
  }

  findAll(companyId: string) {
    return this.prisma.employee.findMany({
      where: {
        companyId,
        status: {
          not: EmployeeStatus.ARCHIVED,
        },
      },
      orderBy: {
        name: "asc",
      },
      include: {
        department: true,
        position: true,
      },
    });
  }

  findArchived(companyId: string) {
    return this.prisma.employee.findMany({
      where: {
        companyId,
        status: EmployeeStatus.ARCHIVED,
      },
      orderBy: {
        archivedAt: "desc",
      },
      include: {
        department: true,
        position: true,
      },
    });
  }

  findOne(
    companyId: string,
    id: string,
  ) {
    return this.prisma.employee.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        department: true,
        position: true,
      },
    });
  }

  update(
    companyId: string,
    id: string,
    data: UpdateEmployeeData,
  ) {
    return this.prisma.employee.updateMany({
      where: {
        id,
        companyId,
        status: {
          not: EmployeeStatus.ARCHIVED,
        },
      },
      data,
    });
  }

  archive(
    companyId: string,
    id: string,
  ) {
    return this.prisma.employee.updateMany({
      where: {
        id,
        companyId,
        status: {
          not: EmployeeStatus.ARCHIVED,
        },
      },
      data: {
        status: EmployeeStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });
  }

  restore(
    companyId: string,
    id: string,
  ) {
    return this.prisma.employee.updateMany({
      where: {
        id,
        companyId,
        status: EmployeeStatus.ARCHIVED,
      },
      data: {
        status: EmployeeStatus.ACTIVE,
        archivedAt: null,
      },
    });
  }

  findDepartment(
    companyId: string,
    departmentId: string,
  ) {
    return this.prisma.department.findFirst({
      where: {
        id: departmentId,
        companyId,
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
}
