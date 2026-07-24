import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { PrismaService } from "@plataforma/database";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    data: CreateDepartmentDto,
  ) {
    const department = await this.createDepartment(
      company.companyId,
      data,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "department",
      resourceId: department.id,
      metadata: {
        name: department.name,
      },
    });

    return department;
  }

  findAll(company: AuthenticatedCompany) {
    return this.prisma.department.findMany({
      where: {
        companyId: company.companyId,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  async findOne(
    company: AuthenticatedCompany,
    id: string,
  ) {
    const department =
      await this.prisma.department.findFirst({
        where: {
          id,
          companyId: company.companyId,
        },
      });

    if (department === null) {
      throw new NotFoundException(
        "Department not found",
      );
    }

    return department;
  }

  async update(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
    data: UpdateDepartmentDto,
  ) {
    await this.updateDepartment(
      company.companyId,
      id,
      data,
    );

    const department = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "department",
      resourceId: department.id,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) =>
            data[key as keyof UpdateDepartmentDto] !==
            undefined,
        ),
      },
    });

    return department;
  }

  async remove(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const department = await this.findOne(
      company,
      id,
    );

    await this.prisma.department.deleteMany({
      where: {
        id,
        companyId: company.companyId,
      },
    });

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.DELETE,
      resource: "department",
      resourceId: department.id,
      metadata: {
        name: department.name,
      },
    });

    return {
      deleted: true,
      id: department.id,
    };
  }

  private async createDepartment(
    companyId: string,
    data: CreateDepartmentDto,
  ) {
    try {
      return await this.prisma.department.create({
        data: {
          companyId,
          name: data.name.trim(),
          description: data.description?.trim(),
        },
      });
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private async updateDepartment(
    companyId: string,
    id: string,
    data: UpdateDepartmentDto,
  ) {
    try {
      const result =
        await this.prisma.department.updateMany({
          where: {
            id,
            companyId,
          },
          data: {
            name: data.name?.trim(),
            description: data.description?.trim(),
          },
        });

      if (result.count === 0) {
        throw new NotFoundException(
          "Department not found",
        );
      }
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private handleDatabaseError(error: unknown): never {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BadRequestException(
        "Department name already exists",
      );
    }

    throw error;
  }
}
