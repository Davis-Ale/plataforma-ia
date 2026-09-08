import { NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  CompanyUserRole,
  RequestStatus,
} from "@prisma/client";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AuditService } from "../audit/audit.service";
import { RequestsRepository } from "./requests.repository";
import { RequestsService } from "./requests.service";

describe("RequestsService", () => {
  const companyId =
    "11111111-1111-4111-8111-111111111111";

  const userId =
    "22222222-2222-4222-8222-222222222222";

  const requestId =
    "44444444-4444-4444-8444-444444444444";

  const user = {
    id: userId,
  } as AuthenticatedUser;

  const memberCompany = {
    companyId,
    role: CompanyUserRole.MEMBER,
  } as AuthenticatedCompany;

  const ownerCompany = {
    companyId,
    role: CompanyUserRole.OWNER,
  } as AuthenticatedCompany;

  const adminCompany = {
    companyId,
    role: CompanyUserRole.ADMIN,
  } as AuthenticatedCompany;

  const sampleRequest = {
    id: requestId,
    companyId,
    createdByUserId: userId,
    title: "Support needed",
    description: "Need help with access",
    status: RequestStatus.OPEN,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repository: jest.Mocked<RequestsRepository>;
  let auditService: jest.Mocked<AuditService>;
  let service: RequestsService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findMany: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<RequestsRepository>;

    auditService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    service = new RequestsService(
      repository,
      auditService,
    );
  });

  it("creates a request with authenticated user and OPEN status and audits CREATE", async () => {
    repository.create.mockResolvedValue(sampleRequest);

    const result = await service.create(
      memberCompany,
      user,
      {
        title: "Support needed",
        description: "Need help with access",
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      companyId,
      {
        createdByUserId: userId,
        title: "Support needed",
        description: "Need help with access",
        status: RequestStatus.OPEN,
      },
    );

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId,
        action: AuditAction.CREATE,
        resource: "request",
        resourceId: requestId,
      }),
    );

    expect(result.id).toBe(requestId);
  });

  it("applies pagination and caps the limit at 100", async () => {
    repository.findMany.mockResolvedValue([
      [],
      250,
    ]);

    const result = await service.findAll(
      memberCompany,
      user,
      {
        page: "2",
        limit: "500",
      },
    );

    expect(repository.findMany).toHaveBeenCalledWith(
      companyId,
      {
        page: "2",
        limit: "500",
      },
      100,
      100,
      userId,
    );

    expect(result.meta).toEqual({
      page: 2,
      limit: 100,
      total: 250,
      totalPages: 3,
    });
  });

  it("filters findAll by author for MEMBER", async () => {
    repository.findMany.mockResolvedValue([
      [sampleRequest],
      1,
    ]);

    await service.findAll(
      memberCompany,
      user,
      {},
    );

    expect(repository.findMany).toHaveBeenCalledWith(
      companyId,
      {},
      0,
      20,
      userId,
    );
  });

  it("does not restrict findAll by author for OWNER", async () => {
    repository.findMany.mockResolvedValue([
      [sampleRequest],
      1,
    ]);

    await service.findAll(
      ownerCompany,
      user,
      {},
    );

    expect(repository.findMany).toHaveBeenCalledWith(
      companyId,
      {},
      0,
      20,
      undefined,
    );
  });

  it("does not restrict findAll by author for ADMIN", async () => {
    repository.findMany.mockResolvedValue([
      [sampleRequest],
      1,
    ]);

    await service.findAll(
      adminCompany,
      user,
      {},
    );

    expect(repository.findMany).toHaveBeenCalledWith(
      companyId,
      {},
      0,
      20,
      undefined,
    );
  });

  it("throws NotFoundException when MEMBER finds another users request", async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.findOne(
        memberCompany,
        user,
        requestId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findOne).toHaveBeenCalledWith(
      companyId,
      requestId,
      userId,
    );
  });

  it("throws NotFoundException when request does not exist in tenant", async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.findOne(
        ownerCompany,
        user,
        requestId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updates status and audits UPDATE", async () => {
    const closedRequest = {
      ...sampleRequest,
      status: RequestStatus.CLOSED,
    };

    repository.findOne
      .mockResolvedValueOnce(sampleRequest)
      .mockResolvedValueOnce(closedRequest);

    repository.update.mockResolvedValue({
      count: 1,
    });

    const result = await service.update(
      adminCompany,
      user,
      requestId,
      {
        status: RequestStatus.CLOSED,
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      companyId,
      requestId,
      {
        status: RequestStatus.CLOSED,
      },
    );

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId,
        action: AuditAction.UPDATE,
        resource: "request",
        resourceId: requestId,
        metadata: {
          changedFields: ["status"],
        },
      }),
    );

    expect(result.status).toBe(RequestStatus.CLOSED);
  });
});
