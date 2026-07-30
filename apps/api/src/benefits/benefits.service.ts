import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  BenefitStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import {
  BenefitsRepository,
  CreateBenefitData,
  UpdateBenefitData,
} from "./benefits.repository";
import { CreateBenefitDto } from "./dto/create-benefit.dto";
import { FindBenefitsQueryDto } from "./dto/find-benefits-query.dto";
import { UpdateBenefitDto } from "./dto/update-benefit.dto";

@Injectable()
export class BenefitsService {
  constructor(
    private readonly benefitsRepository: BenefitsRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    data: CreateBenefitDto,
  ) {
    await this.validateEmployee(
      company.companyId,
      data.employeeId,
    );

    const benefit = await this.createBenefit(
      company.companyId,
      {
        employeeId: data.employeeId,
        type: data.type,
        status: data.status ?? BenefitStatus.ACTIVE,
      },
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "benefit",
      resourceId: benefit.id,
      metadata: {
        employeeId: benefit.employeeId,
        type: benefit.type,
        status: benefit.status,
      },
    });

    return benefit;
  }

  findAll(
    company: AuthenticatedCompany,
    query: FindBenefitsQueryDto,
  ) {
    return this.benefitsRepository.findAll(
      company.companyId,
      query,
    );
  }

  async findOne(
    company: AuthenticatedCompany,
    id: string,
  ) {
    const benefit =
      await this.benefitsRepository.findOne(
        company.companyId,
        id,
      );

    if (benefit === null) {
      throw new NotFoundException(
        "Benefit not found",
      );
    }

    return benefit;
  }

  async update(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
    data: UpdateBenefitDto,
  ) {
    if (data.employeeId !== undefined) {
      await this.validateEmployee(
        company.companyId,
        data.employeeId,
      );
    }

    await this.updateBenefit(
      company.companyId,
      id,
      {
        employeeId: data.employeeId,
        type: data.type,
        status: data.status,
      },
    );

    const benefit = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "benefit",
      resourceId: benefit.id,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) =>
            data[key as keyof UpdateBenefitDto] !==
            undefined,
        ),
      },
    });

    return benefit;
  }

  async remove(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const benefit = await this.findOne(
      company,
      id,
    );

    await this.benefitsRepository.remove(
      company.companyId,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.DELETE,
      resource: "benefit",
      resourceId: benefit.id,
      metadata: {
        employeeId: benefit.employeeId,
        type: benefit.type,
      },
    });

    return {
      deleted: true,
      id: benefit.id,
    };
  }

  private async validateEmployee(
    companyId: string,
    employeeId: string,
  ) {
    const employee =
      await this.benefitsRepository.findEmployee(
        companyId,
        employeeId,
      );

    if (employee === null) {
      throw new BadRequestException(
        "Employee not found",
      );
    }
  }

  private async createBenefit(
    companyId: string,
    data: CreateBenefitData,
  ) {
    try {
      return await this.benefitsRepository.create(
        companyId,
        data,
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private async updateBenefit(
    companyId: string,
    id: string,
    data: UpdateBenefitData,
  ) {
    try {
      const result =
        await this.benefitsRepository.update(
          companyId,
          id,
          data,
        );

      if (result.count === 0) {
        throw new NotFoundException(
          "Benefit not found",
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
        "Employee already has this benefit",
      );
    }

    throw error;
  }
}
