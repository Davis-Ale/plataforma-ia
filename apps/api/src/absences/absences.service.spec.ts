import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  AbsenceStatus,
  AbsenceType,
  AuditAction,
  CompanyUserRole,
} from "@prisma/client";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AuditService } from "../audit/audit.service";
import { AbsencesRepository } from "./absences.repository";
import { AbsencesService } from "./absences.service";

describe("AbsencesService", () => {
  const company = {
    companyId: "11111111-1111-4111-8111-111111111111",
    role: CompanyUserRole.ADMIN,
  } as AuthenticatedCompany;

  const user = {
    id: "22222222-2222-4222-8222-222222222222",
  } as AuthenticatedUser;

  const employeeId =
    "33333333-3333-4333-8333-333333333333";

  const absenceId =
    "44444444-4444-4444-8444-444444444444";

  let repository: jest.Mocked<AbsencesRepository>;
  let auditService: jest.Mocked<AuditService>;
  let service: AbsencesService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findMany: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findEmployee: jest.fn(),
    } as unknown as jest.Mocked<AbsencesRepository>;

    auditService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    service = new AbsencesService(
      repository,
      auditService,
    );
  });

  it("creates an absence for an employee in the company", async () => {
    repository.findEmployee.mockResolvedValue({
      id: employeeId,
    });

    repository.create.mockResolvedValue({
      id: absenceId,
      companyId: company.companyId,
      employeeId,
      type: AbsenceType.VACATION,
      startDate: new Date("2026-08-17T00:00:00.000Z"),
      endDate: new Date("2026-08-20T00:00:00.000Z"),
      reason: null,
      status: AbsenceStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: {} as never,
    });

    const result = await service.create(
      company,
      user,
      {
        employeeId,
        type: AbsenceType.VACATION,
        startDate: "2026-08-17",
        endDate: "2026-08-20",
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
        startDate: new Date(
          "2026-08-17T00:00:00.000Z",
        ),
        endDate: new Date(
          "2026-08-20T00:00:00.000Z",
        ),
        status: AbsenceStatus.PENDING,
      }),
    );

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: company.companyId,
        userId: user.id,
        action: AuditAction.CREATE,
        resource: "absence",
        resourceId: absenceId,
      }),
    );

    expect(result.id).toBe(absenceId);
  });

  it("rejects an employee outside the company", async () => {
    repository.findEmployee.mockResolvedValue(null);

    await expect(
      service.create(
        company,
        user,
        {
          employeeId,
          type: AbsenceType.VACATION,
          startDate: "2026-08-17",
          endDate: "2026-08-20",
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects end date before start date on create", async () => {
    repository.findEmployee.mockResolvedValue({
      id: employeeId,
    });

    await expect(
      service.create(
        company,
        user,
        {
          employeeId,
          type: AbsenceType.VACATION,
          startDate: "2026-08-20",
          endDate: "2026-08-17",
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid date range on findAll", async () => {
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

  it("throws when the absence does not exist", async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.findOne(
        company,
        absenceId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
