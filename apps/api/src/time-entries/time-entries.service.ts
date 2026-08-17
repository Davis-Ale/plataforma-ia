import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  TimeEntryStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateTimeEntryDto } from "./dto/create-time-entry.dto";
import { FindTimeEntriesQueryDto } from "./dto/find-time-entries-query.dto";
import { UpdateTimeEntryDto } from "./dto/update-time-entry.dto";
import {
  CreateTimeEntryData,
  TimeEntriesRepository,
  UpdateTimeEntryData,
} from "./time-entries.repository";

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly timeEntriesRepository: TimeEntriesRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    data: CreateTimeEntryDto,
  ) {
    await this.validateEmployee(
      company.companyId,
      data.employeeId,
    );

    const clockIn =
      data.clockIn === undefined
        ? undefined
        : new Date(data.clockIn);
    const clockOut =
      data.clockOut === undefined
        ? undefined
        : new Date(data.clockOut);

    this.validateClockRange(clockIn, clockOut);

    const timeEntry = await this.createTimeEntry(
      company.companyId,
      {
        employeeId: data.employeeId,
        workDate: this.toWorkDate(data.workDate),
        clockIn,
        clockOut,
        workedMinutes: data.workedMinutes ?? 0,
        lateMinutes: data.lateMinutes ?? 0,
        balanceMinutes: data.balanceMinutes ?? 0,
        status: data.status ?? TimeEntryStatus.PRESENT,
      },
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "time_entry",
      resourceId: timeEntry.id,
      metadata: {
        employeeId: timeEntry.employeeId,
        workDate: timeEntry.workDate.toISOString(),
        status: timeEntry.status,
      },
    });

    return timeEntry;
  }

  async findAll(
    company: AuthenticatedCompany,
    query: FindTimeEntriesQueryDto,
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
      await this.timeEntriesRepository.findMany(
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
    const timeEntry =
      await this.timeEntriesRepository.findOne(
        company.companyId,
        id,
      );

    if (timeEntry === null) {
      throw new NotFoundException(
        "Time entry not found",
      );
    }

    return timeEntry;
  }

  async update(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
    data: UpdateTimeEntryDto,
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

    const clockIn =
      data.clockIn === undefined
        ? current.clockIn
        : new Date(data.clockIn);
    const clockOut =
      data.clockOut === undefined
        ? current.clockOut
        : new Date(data.clockOut);

    this.validateClockRange(clockIn, clockOut);

    await this.updateTimeEntry(
      company.companyId,
      id,
      {
        employeeId: data.employeeId,
        workDate:
          data.workDate === undefined
            ? undefined
            : this.toWorkDate(data.workDate),
        clockIn:
          data.clockIn === undefined
            ? undefined
            : clockIn ?? undefined,
        clockOut:
          data.clockOut === undefined
            ? undefined
            : clockOut ?? undefined,
        workedMinutes: data.workedMinutes,
        lateMinutes: data.lateMinutes,
        balanceMinutes: data.balanceMinutes,
        status: data.status,
      },
    );

    const timeEntry = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "time_entry",
      resourceId: timeEntry.id,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) =>
            data[key as keyof UpdateTimeEntryDto] !==
            undefined,
        ),
      },
    });

    return timeEntry;
  }

  async remove(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const timeEntry = await this.findOne(
      company,
      id,
    );

    await this.timeEntriesRepository.remove(
      company.companyId,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.DELETE,
      resource: "time_entry",
      resourceId: timeEntry.id,
      metadata: {
        employeeId: timeEntry.employeeId,
        workDate: timeEntry.workDate.toISOString(),
      },
    });

    return {
      deleted: true,
      id: timeEntry.id,
    };
  }

  private async validateEmployee(
    companyId: string,
    employeeId: string,
  ) {
    const employee =
      await this.timeEntriesRepository.findEmployee(
        companyId,
        employeeId,
      );

    if (employee === null) {
      throw new BadRequestException(
        "Employee not found",
      );
    }
  }

  private async createTimeEntry(
    companyId: string,
    data: CreateTimeEntryData,
  ) {
    try {
      return await this.timeEntriesRepository.create(
        companyId,
        data,
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private async updateTimeEntry(
    companyId: string,
    id: string,
    data: UpdateTimeEntryData,
  ) {
    try {
      const result =
        await this.timeEntriesRepository.update(
          companyId,
          id,
          data,
        );

      if (result.count === 0) {
        throw new NotFoundException(
          "Time entry not found",
        );
      }
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private validateClockRange(
    clockIn?: Date | null,
    clockOut?: Date | null,
  ) {
    if (
      clockIn !== undefined &&
      clockIn !== null &&
      clockOut !== undefined &&
      clockOut !== null &&
      clockOut.getTime() < clockIn.getTime()
    ) {
      throw new BadRequestException(
        "Clock out cannot be before clock in",
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
      this.toWorkDate(startDate).getTime() >
        this.toWorkDate(endDate).getTime()
    ) {
      throw new BadRequestException(
        "Start date cannot be after end date",
      );
    }
  }

  private toWorkDate(value: string) {
    return new Date(value + "T00:00:00.000Z");
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

  private handleDatabaseError(
    error: unknown,
  ): never {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BadRequestException(
        "Time entry already exists for employee on this date",
      );
    }

    throw error;
  }
}
