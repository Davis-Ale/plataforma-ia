import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AbsenceStatus,
  AuditAction,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateAbsenceDto } from "./dto/create-absence.dto";
import { FindAbsencesQueryDto } from "./dto/find-absences-query.dto";
import { UpdateAbsenceDto } from "./dto/update-absence.dto";
import {
  AbsencesRepository,
  UpdateAbsenceData,
} from "./absences.repository";

@Injectable()
export class AbsencesService {
  constructor(
    private readonly absencesRepository: AbsencesRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    data: CreateAbsenceDto,
  ) {
    await this.validateEmployee(
      company.companyId,
      data.employeeId,
    );

    this.validateDateRange(
      data.startDate,
      data.endDate,
    );

    const startDate = this.toDate(data.startDate);
    const endDate = this.toDate(data.endDate);

    const absence =
      await this.absencesRepository.create(
        company.companyId,
        {
          employeeId: data.employeeId,
          type: data.type,
          startDate,
          endDate,
          reason: data.reason,
          status:
            data.status ?? AbsenceStatus.PENDING,
        },
      );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "absence",
      resourceId: absence.id,
      metadata: {
        employeeId: absence.employeeId,
        type: absence.type,
        startDate: absence.startDate.toISOString(),
        endDate: absence.endDate.toISOString(),
        status: absence.status,
      },
    });

    return absence;
  }

  async findAll(
    company: AuthenticatedCompany,
    query: FindAbsencesQueryDto,
  ) {
    this.validateDateRange(
      query.startDate,
      query.endDate,
    );

    const page = this.toPositiveNumber(
      query.page,
      1,
    );
    const requestedLimit = this.toPositiveNumber(
      query.limit,
      20,
    );
    const limit = Math.min(requestedLimit, 100);
    const skip = (page - 1) * limit;

    const [items, total] =
      await this.absencesRepository.findMany(
        company.companyId,
        query,
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

  async findOne(
    company: AuthenticatedCompany,
    id: string,
  ) {
    const absence =
      await this.absencesRepository.findOne(
        company.companyId,
        id,
      );

    if (absence === null) {
      throw new NotFoundException(
        "Absence not found",
      );
    }

    return absence;
  }

  async update(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
    data: UpdateAbsenceDto,
  ) {
    const current = await this.findOne(
      company,
      id,
    );

    if (data.employeeId !== undefined) {
      await this.validateEmployee(
        company.companyId,
        data.employeeId,
      );
    }

    const startDate =
      data.startDate === undefined
        ? current.startDate
        : this.toDate(data.startDate);

    const endDate =
      data.endDate === undefined
        ? current.endDate
        : this.toDate(data.endDate);

    this.validateDateRange(
      data.startDate ??
        this.toDateString(current.startDate),
      data.endDate ??
        this.toDateString(current.endDate),
    );

    const updateData: UpdateAbsenceData = {
      employeeId: data.employeeId,
      type: data.type,
      startDate:
        data.startDate === undefined
          ? undefined
          : startDate,
      endDate:
        data.endDate === undefined
          ? undefined
          : endDate,
      reason: data.reason,
      status: data.status,
    };

    const result =
      await this.absencesRepository.update(
        company.companyId,
        id,
        updateData,
      );

    if (result.count === 0) {
      throw new NotFoundException(
        "Absence not found",
      );
    }

    const absence = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "absence",
      resourceId: absence.id,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) =>
            data[key as keyof UpdateAbsenceDto] !==
            undefined,
        ),
      },
    });

    return absence;
  }

  async remove(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const absence = await this.findOne(
      company,
      id,
    );

    await this.absencesRepository.remove(
      company.companyId,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.DELETE,
      resource: "absence",
      resourceId: absence.id,
      metadata: {
        employeeId: absence.employeeId,
        type: absence.type,
      },
    });

    return {
      deleted: true,
      id: absence.id,
    };
  }

  private async validateEmployee(
    companyId: string,
    employeeId: string,
  ) {
    const employee =
      await this.absencesRepository.findEmployee(
        companyId,
        employeeId,
      );

    if (employee === null) {
      throw new BadRequestException(
        "Employee not found",
      );
    }
  }

  private validateDateRange(
    startDate?: string,
    endDate?: string,
  ) {
    if (
      startDate !== undefined &&
      endDate !== undefined &&
      this.toDate(startDate).getTime() >
        this.toDate(endDate).getTime()
    ) {
      throw new BadRequestException(
        "Start date cannot be after end date",
      );
    }
  }

  private toDate(value: string) {
    return new Date(
      value + "T00:00:00.000Z",
    );
  }

  private toDateString(value: Date) {
    return value.toISOString().slice(0, 10);
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
