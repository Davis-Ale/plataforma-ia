import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  EmployeeStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { EmployeesRepository } from "./employees.repository";

@Injectable()
export class EmployeesService {
  constructor(
    private readonly employeesRepository: EmployeesRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    data: CreateEmployeeDto,
  ) {
    if (data.status === EmployeeStatus.ARCHIVED) {
      throw new BadRequestException(
        "Use the archive endpoint to archive employees",
      );
    }

    await this.validateStructure(
      company.companyId,
      data.departmentId,
      data.positionId,
    );

    const employee = await this.createEmployee(
      company.companyId,
      data,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "employee",
      resourceId: employee.id,
      metadata: {
        name: employee.name,
        cpf: employee.cpf,
      },
    });

    return employee;
  }

  findAll(company: AuthenticatedCompany) {
    return this.employeesRepository.findAll(
      company.companyId,
    );
  }

  findArchived(company: AuthenticatedCompany) {
    return this.employeesRepository.findArchived(
      company.companyId,
    );
  }

  async findOne(
    company: AuthenticatedCompany,
    id: string,
  ) {
    const employee =
      await this.employeesRepository.findOne(
        company.companyId,
        id,
      );

    if (employee === null) {
      throw new NotFoundException(
        "Employee not found",
      );
    }

    return employee;
  }

  async update(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
    data: UpdateEmployeeDto,
  ) {
    if (data.status === EmployeeStatus.ARCHIVED) {
      throw new BadRequestException(
        "Use the archive endpoint to archive employees",
      );
    }

    await this.validateStructure(
      company.companyId,
      data.departmentId,
      data.positionId,
    );

    const result = await this.updateEmployee(
      company.companyId,
      id,
      data,
    );

    if (result.count === 0) {
      throw new NotFoundException(
        "Employee not found",
      );
    }

    const employee = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "employee",
      resourceId: employee.id,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) =>
            data[key as keyof UpdateEmployeeDto] !==
            undefined,
        ),
      },
    });

    return employee;
  }

  async archive(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const employee = await this.findOne(
      company,
      id,
    );

    if (employee.status === EmployeeStatus.ARCHIVED) {
      throw new BadRequestException(
        "Employee is already archived",
      );
    }

    await this.employeesRepository.archive(
      company.companyId,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.ARCHIVE,
      resource: "employee",
      resourceId: employee.id,
      metadata: {
        name: employee.name,
        cpf: employee.cpf,
      },
    });

    return this.findOne(company, id);
  }

  async restore(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const result =
      await this.employeesRepository.restore(
        company.companyId,
        id,
      );

    if (result.count === 0) {
      throw new NotFoundException(
        "Archived employee not found",
      );
    }

    const employee = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "employee",
      resourceId: employee.id,
      metadata: {
        restored: true,
        name: employee.name,
      },
    });

    return employee;
  }

  private async createEmployee(
    companyId: string,
    data: CreateEmployeeDto,
  ) {
    try {
      return await this.employeesRepository.create(
        companyId,
        {
          departmentId: data.departmentId,
          positionId: data.positionId,
          name: data.name.trim(),
          cpf: this.normalizeCpf(data.cpf),
          email: data.email.trim().toLowerCase(),
          status: data.status ?? EmployeeStatus.ACTIVE,
        },
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private async updateEmployee(
    companyId: string,
    id: string,
    data: UpdateEmployeeDto,
  ) {
    try {
      return await this.employeesRepository.update(
        companyId,
        id,
        {
          departmentId: data.departmentId,
          positionId: data.positionId,
          name: data.name?.trim(),
          cpf:
            data.cpf === undefined
              ? undefined
              : this.normalizeCpf(data.cpf),
          email: data.email?.trim().toLowerCase(),
          status: data.status,
        },
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private async validateStructure(
    companyId: string,
    departmentId?: string,
    positionId?: string,
  ) {
    const [department, position] =
      await Promise.all([
        departmentId === undefined
          ? Promise.resolve({ id: "" })
          : this.employeesRepository.findDepartment(
              companyId,
              departmentId,
            ),
        positionId === undefined
          ? Promise.resolve({ id: "" })
          : this.employeesRepository.findPosition(
              companyId,
              positionId,
            ),
      ]);

    if (
      departmentId !== undefined &&
      department === null
    ) {
      throw new BadRequestException(
        "Department not found",
      );
    }

    if (
      positionId !== undefined &&
      position === null
    ) {
      throw new BadRequestException(
        "Position not found",
      );
    }
  }

  private normalizeCpf(cpf: string) {
    const normalizedCpf = cpf.replace(/\D/g, "");

    if (normalizedCpf.length !== 11) {
      throw new BadRequestException(
        "CPF must contain 11 digits",
      );
    }

    return normalizedCpf;
  }

  private handleDatabaseError(error: unknown): never {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BadRequestException(
        "Employee CPF already exists",
      );
    }

    throw error;
  }
}
