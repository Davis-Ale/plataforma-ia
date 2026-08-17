import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CompanyUserRole, TimeEntryStatus } from "@prisma/client";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AuditService } from "../audit/audit.service";
import { TimeEntriesRepository } from "./time-entries.repository";
import { TimeEntriesService } from "./time-entries.service";

describe("TimeEntriesService", () => {
  const company = {
    companyId: "11111111-1111-4111-8111-111111111111",
    role: CompanyUserRole.ADMIN,
  } as AuthenticatedCompany;

  const user = {
    id: "22222222-2222-4222-8222-222222222222",
  } as AuthenticatedUser;

  const employeeId =
    "33333333-3333-4333-8333-333333333333";

  const timeEntryId =
    "44444444-4444-4444-8444-444444444444";

  let repository: jest.Mocked<TimeEntriesRepository>;
  let auditService: jest.Mocked<AuditService>;
  let service: TimeEntriesService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findMany: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findEmployee: jest.fn(),
    } as unknown as jest.Mocked<TimeEntriesRepository>;

    auditService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    service = new TimeEntriesService(
      repository,
      auditService,
    );
  });

  it("creates a time entry for an employee in the company", async () => {
    repository.findEmployee.mockResolvedValue({
      id: employeeId,
    });

    repository.create.mockResolvedValue({
      id: timeEntryId,
      companyId: company.companyId,
      employeeId,
      workDate: new Date("2026-08-17T00:00:00.000Z"),
      clockIn: new Date("2026-08-17T08:00:00.000Z"),
      clockOut: new Date("2026-08-17T17:00:00.000Z"),
      workedMinutes: 540,
      lateMinutes: 0,
      balanceMinutes: 60,
      status: TimeEntryStatus.PRESENT,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: {} as never,
    });

    const result = await service.create(
      company,
      user,
      {
        employeeId,
        workDate: "2026-08-17",
        clockIn: "2026-08-17T08:00:00.000Z",
        clockOut: "2026-08-17T17:00:00.000Z",
        workedMinutes: 540,
        balanceMinutes: 60,
      },
    );

    expect(repository.findEmployee).toHaveBeenCalledWith(
      company.companyId,
      employeeId,
    );

    expect(repository.create).toHaveBeenCalledWith(
      company.companyId,
      expect.objectContaining({
        employeeId,
        workDate: new Date(
          "2026-08-17T00:00:00.000Z",
        ),
        status: TimeEntryStatus.PRESENT,
      }),
    );

    expect(auditService.create).toHaveBeenCalled();

    expect(result.id).toBe(timeEntryId);
  });

  it("rejects an employee outside the company", async () => {
    repository.findEmployee.mockResolvedValue(null);

    await expect(
      service.create(
        company,
        user,
        {
          employeeId,
          workDate: "2026-08-17",
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects clock out before clock in", async () => {
    repository.findEmployee.mockResolvedValue({
      id: employeeId,
    });

    await expect(
      service.create(
        company,
        user,
        {
          employeeId,
          workDate: "2026-08-17",
          clockIn: "2026-08-17T17:00:00.000Z",
          clockOut: "2026-08-17T08:00:00.000Z",
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid date range", async () => {
    await expect(
      service.findAll(
        company,
        {
          startDate: "2026-08-18",
          endDate: "2026-08-17",
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.findMany).not.toHaveBeenCalled();
  });

  it("applies pagination and caps the limit at 100", async () => {
    repository.findMany.mockResolvedValue([
      [],
      250,
    ]);

    const result = await service.findAll(
      company,
      {
        page: "2",
        limit: "500",
      },
    );

    expect(repository.findMany).toHaveBeenCalledWith(
      company.companyId,
      {
        page: "2",
        limit: "500",
      },
      100,
      100,
    );

    expect(result.meta).toEqual({
      page: 2,
      limit: 100,
      total: 250,
      totalPages: 3,
    });
  });

  it("throws when the time entry does not exist", async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.findOne(
        company,
        timeEntryId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
