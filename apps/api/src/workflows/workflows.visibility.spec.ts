import { NotFoundException } from "@nestjs/common";
import { WorkflowStatus } from "@prisma/client";
import {
  WorkflowsRepository,
  WorkflowsService as WorkflowsEngineService,
} from "@plataforma/workflows";
import { AuditService } from "../audit/audit.service";
import { WorkflowsService } from "./workflows.service";

describe("Workflow execution visibility", () => {
  const companyId = "company-a";
  const otherCompanyId = "company-b";
  const workflowRunId = "run-a";
  const createdAt = new Date("2026-11-05T12:00:00.000Z");

  const listItem = {
    id: workflowRunId,
    workflowKey: "operations.prepare_from_contract",
    status: WorkflowStatus.COMPLETED,
    operationId: "operation-a",
    correlationId: "correlation-a",
    error: null,
    startedAt: createdAt,
    completedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    _count: { steps: 3 },
  };

  const detail = {
    ...listItem,
    execution: null,
    steps: [
      {
        id: "step-a",
        stepKey: "read_contract",
        stepOrder: 1,
        status: WorkflowStatus.COMPLETED,
        error: null,
        startedAt: createdAt,
        completedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };

  let repository: jest.Mocked<WorkflowsRepository>;
  let service: WorkflowsService;

  beforeEach(() => {
    repository = {
      createRun: jest.fn(),
      findRun: jest.fn(),
      findRunByOperationId: jest.fn(),
      findRuns: jest.fn(),
      findRunWithSteps: jest.fn(),
      updateRun: jest.fn(),
      createStep: jest.fn(),
      findStep: jest.fn(),
      updateStep: jest.fn(),
    } as unknown as jest.Mocked<WorkflowsRepository>;

    const engine = new WorkflowsEngineService(repository);
    const auditService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    service = new WorkflowsService(engine, auditService);
  });

  it("lists only the authenticated tenant with bounded pagination", async () => {
    repository.findRuns.mockResolvedValue([[listItem], 1]);

    const result = await service.findAll(companyId, {
      page: "2",
      limit: "500",
      status: WorkflowStatus.COMPLETED,
    });

    expect(repository.findRuns).toHaveBeenCalledWith(
      companyId,
      WorkflowStatus.COMPLETED,
      100,
      100,
    );
    expect(result).toEqual({
      items: [listItem],
      meta: {
        page: 2,
        limit: 100,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it("returns a tenant-scoped workflow with ordered persisted steps", async () => {
    repository.findRunWithSteps.mockResolvedValue({ ...detail, execution: null });

    await expect(
      service.findOne(companyId, workflowRunId),
    ).resolves.toEqual(detail);

    expect(repository.findRunWithSteps).toHaveBeenCalledWith(
      companyId,
      workflowRunId,
    );
  });

  it("fails closed when the run is not visible to the tenant", async () => {
    repository.findRunWithSteps.mockResolvedValue(null);

    await expect(
      service.findOne(otherCompanyId, workflowRunId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
