import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  ContractStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ContractsRepository } from "./contracts.repository";
import { CreateContractDto } from "./dto/create-contract.dto";
import { FindContractsQueryDto } from "./dto/find-contracts-query.dto";
import { UpdateContractDto } from "./dto/update-contract.dto";

@Injectable()
export class ContractsService {
  constructor(
    private readonly contractsRepository: ContractsRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    data: CreateContractDto,
  ) {
    if (data.status === ContractStatus.ARCHIVED) {
      throw new BadRequestException(
        "Use the archive endpoint to archive contracts",
      );
    }

    await this.validateRelations(
      company.companyId,
      data.employeeId,
      data.positionId,
    );

    const contract =
      await this.contractsRepository.create(
        company.companyId,
        {
          employeeId: data.employeeId,
          positionId: data.positionId,
          employmentType:
            data.employmentType.trim(),
          admissionDate: new Date(
            data.admissionDate,
          ),
          unit: data.unit.trim(),
          workRegime: data.workRegime.trim(),
          status:
            data.status ?? ContractStatus.ACTIVE,
        },
      );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "contract",
      resourceId: contract.id,
      metadata: {
        employeeId: contract.employeeId,
        employmentType:
          contract.employmentType,
        admissionDate:
          contract.admissionDate.toISOString(),
      },
    });

    return contract;
  }

  async findAll(
    company: AuthenticatedCompany,
    query: FindContractsQueryDto,
  ) {
    return this.findMany(
      company.companyId,
      query,
      false,
    );
  }

  async findArchived(
    company: AuthenticatedCompany,
    query: FindContractsQueryDto,
  ) {
    return this.findMany(
      company.companyId,
      query,
      true,
    );
  }

  async findOne(
    company: AuthenticatedCompany,
    id: string,
  ) {
    const contract =
      await this.contractsRepository.findOne(
        company.companyId,
        id,
      );

    if (contract === null) {
      throw new NotFoundException(
        "Contract not found",
      );
    }

    return contract;
  }

  async update(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
    data: UpdateContractDto,
  ) {
    if (data.status === ContractStatus.ARCHIVED) {
      throw new BadRequestException(
        "Use the archive endpoint to archive contracts",
      );
    }

    await this.validateRelations(
      company.companyId,
      data.employeeId,
      data.positionId,
    );

    const result =
      await this.contractsRepository.update(
        company.companyId,
        id,
        {
          employeeId: data.employeeId,
          positionId: data.positionId,
          employmentType:
            data.employmentType?.trim(),
          admissionDate:
            data.admissionDate === undefined
              ? undefined
              : new Date(data.admissionDate),
          unit: data.unit?.trim(),
          workRegime: data.workRegime?.trim(),
          status: data.status,
        },
      );

    if (result.count === 0) {
      throw new NotFoundException(
        "Contract not found",
      );
    }

    const contract = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "contract",
      resourceId: contract.id,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) =>
            data[key as keyof UpdateContractDto] !==
            undefined,
        ),
      },
    });

    return contract;
  }

  async archive(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const contract = await this.findOne(
      company,
      id,
    );

    if (contract.status === ContractStatus.ARCHIVED) {
      throw new BadRequestException(
        "Contract is already archived",
      );
    }

    await this.contractsRepository.archive(
      company.companyId,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.ARCHIVE,
      resource: "contract",
      resourceId: contract.id,
      metadata: {
        employeeId: contract.employeeId,
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
      await this.contractsRepository.restore(
        company.companyId,
        id,
      );

    if (result.count === 0) {
      throw new NotFoundException(
        "Archived contract not found",
      );
    }

    const contract = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "contract",
      resourceId: contract.id,
      metadata: {
        restored: true,
        employeeId: contract.employeeId,
      },
    });

    return contract;
  }

  private async findMany(
    companyId: string,
    query: FindContractsQueryDto,
    archived: boolean,
  ) {
    const page = this.toPositiveNumber(
      query.page,
      1,
    );
    const requestedLimit =
      this.toPositiveNumber(query.limit, 20);
    const limit = Math.min(
      requestedLimit,
      100,
    );
    const skip = (page - 1) * limit;

    const [items, total] =
      await this.contractsRepository.findMany(
        companyId,
        query,
        archived,
        skip,
        limit,
      );

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async validateRelations(
    companyId: string,
    employeeId?: string,
    positionId?: string,
  ) {
    const [employee, position] =
      await Promise.all([
        employeeId === undefined
          ? Promise.resolve({ id: "" })
          : this.contractsRepository.findEmployee(
              companyId,
              employeeId,
            ),
        positionId === undefined
          ? Promise.resolve({ id: "" })
          : this.contractsRepository.findPosition(
              companyId,
              positionId,
            ),
      ]);

    if (
      employeeId !== undefined &&
      employee === null
    ) {
      throw new BadRequestException(
        "Employee not found",
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

  private toPositiveNumber(
    value: string | undefined,
    fallback: number,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const parsed = Number(value);

    if (
      Number.isNaN(parsed) ||
      parsed < 1
    ) {
      return fallback;
    }

    return Math.floor(parsed);
  }
}
