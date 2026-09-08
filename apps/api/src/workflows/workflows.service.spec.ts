import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  WorkflowStatus,
} from "@prisma/client";
import {
  WorkflowsRepository,
  WorkflowsService as WorkflowsEngineService,
} from "@plataforma/workflows";
import { AuditService } from "../audit/audit.service";
import { WorkflowsService } from "./workflows.service";

describe("WorkflowsService", () => {
  const companyId =
    "11111111-1111-4111-8111-111111111111";

  const otherCompanyId =
    "99999999-9999-4999-8999-999999999999";

  const workflowRunId =
    "44444444-4444-4444-8444-444444444444";

  const workflowStepId =
    "55555555-5555-4555-8555-555555555555";

  const sampleRun = {
    id: workflowRunId,
    companyId,
    workflowKey: "sync-data",
    status: WorkflowStatus.PENDING,
    input: { source: "erp" },
    output: null,
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleStep = {
    id: workflowStepId,
    companyId,
    workflowRunId,
    stepKey: "fetch",
    stepOrder: 1,
    status: WorkflowStatus.PENDING,
    input: null,
    output: null,
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repository: jest.Mocked<WorkflowsRepository>;
  let engine: WorkflowsEngineService;
  let auditService: jest.Mocked<AuditService>;
  let service: WorkflowsService;

  beforeEach(() => {
    repository = {
      createRun: jest.fn(),
      findRun: jest.fn(),
      updateRun: jest.fn(),
      createStep: jest.fn(),
      findStep: jest.fn(),
      updateStep: jest.fn(),
    } as unknown as jest.Mocked<WorkflowsRepository>;

    engine = new WorkflowsEngineService(repository);
    auditService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    service = new WorkflowsService(
      engine,
      auditService,
    );
  });

  it("creates a workflow run in PENDING status and audits CREATE", async () => {
    repository.createRun.mockResolvedValue(sampleRun);

    const result = await service.createRun(
      companyId,
      "sync-data",
      { source: "erp" },
    );

    expect(repository.createRun).toHaveBeenCalledWith(
      companyId,
      {
        workflowKey: "sync-data",
        input: { source: "erp" },
      },
    );

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        action: AuditAction.CREATE,
        resource: "workflow",
        resourceId: workflowRunId,
        metadata: {
          workflowKey: "sync-data",
          status: WorkflowStatus.PENDING,
        },
      }),
    );

    expect(result.status).toBe(WorkflowStatus.PENDING);
  });

  it("creates a step only for a run in the same tenant", async () => {
    repository.findRun.mockResolvedValue(sampleRun);
    repository.createStep.mockResolvedValue(sampleStep);

    const result = await service.createStep(
      companyId,
      workflowRunId,
      {
        stepKey: "fetch",
        stepOrder: 1,
      },
    );

    expect(repository.createStep).toHaveBeenCalledWith(
      companyId,
      workflowRunId,
      {
        stepKey: "fetch",
        stepOrder: 1,
      },
    );

    expect(result.id).toBe(workflowStepId);
  });

  it("throws NotFoundException when creating a step for another tenant run", async () => {
    repository.findRun.mockResolvedValue(null);

    await expect(
      service.createStep(
        otherCompanyId,
        workflowRunId,
        {
          stepKey: "fetch",
          stepOrder: 1,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.createStep).not.toHaveBeenCalled();
  });

  it("rejects creating a step when the run is not PENDING", async () => {
    repository.findRun.mockResolvedValue({
      ...sampleRun,
      status: WorkflowStatus.RUNNING,
    });

    await expect(
      service.createStep(
        companyId,
        workflowRunId,
        {
          stepKey: "fetch",
          stepOrder: 1,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("starts a PENDING run and audits UPDATE changedFields", async () => {
    const runningRun = {
      ...sampleRun,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };

    repository.findRun
      .mockResolvedValueOnce(sampleRun)
      .mockResolvedValueOnce(runningRun);
    repository.updateRun.mockResolvedValue({
      count: 1,
    });

    const result = await service.startRun(
      companyId,
      workflowRunId,
    );

    expect(result.status).toBe(WorkflowStatus.RUNNING);

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        action: AuditAction.UPDATE,
        resource: "workflow",
        resourceId: workflowRunId,
        metadata: {
          changedFields: ["status", "startedAt"],
        },
      }),
    );
  });

  it("rejects starting a run that is not PENDING", async () => {
    repository.findRun.mockResolvedValue({
      ...sampleRun,
      status: WorkflowStatus.RUNNING,
    });

    await expect(
      service.startRun(
        companyId,
        workflowRunId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("starts a PENDING step when the run is RUNNING", async () => {
    const runningRun = {
      ...sampleRun,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };
    const runningStep = {
      ...sampleStep,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };

    repository.findRun.mockResolvedValue(runningRun);
    repository.findStep
      .mockResolvedValueOnce(sampleStep)
      .mockResolvedValueOnce(runningStep);
    repository.updateStep.mockResolvedValue({
      count: 1,
    });

    const result = await service.startStep(
      companyId,
      workflowRunId,
      workflowStepId,
    );

    expect(result.status).toBe(WorkflowStatus.RUNNING);

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          workflowStepId,
          changedFields: ["status", "startedAt"],
        },
      }),
    );
  });

  it("rejects starting a step when the run is not RUNNING", async () => {
    repository.findRun.mockResolvedValue(sampleRun);
    repository.findStep.mockResolvedValue(sampleStep);

    await expect(
      service.startStep(
        companyId,
        workflowRunId,
        workflowStepId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("completes a RUNNING step and audits UPDATE changedFields", async () => {
    const runningStep = {
      ...sampleStep,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };
    const completedStep = {
      ...runningStep,
      status: WorkflowStatus.COMPLETED,
      output: { ok: true },
      completedAt: new Date(),
    };

    repository.findStep
      .mockResolvedValueOnce(runningStep)
      .mockResolvedValueOnce(completedStep);
    repository.updateStep.mockResolvedValue({
      count: 1,
    });

    const result = await service.completeStep(
      companyId,
      workflowRunId,
      workflowStepId,
      { ok: true },
    );

    expect(result.status).toBe(WorkflowStatus.COMPLETED);

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          workflowStepId,
          changedFields: [
            "status",
            "output",
            "completedAt",
          ],
        },
      }),
    );
  });

  it("fails a RUNNING step and audits UPDATE changedFields", async () => {
    const runningStep = {
      ...sampleStep,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };
    const failedStep = {
      ...runningStep,
      status: WorkflowStatus.FAILED,
      error: "step failed",
      completedAt: new Date(),
    };

    repository.findStep
      .mockResolvedValueOnce(runningStep)
      .mockResolvedValueOnce(failedStep);
    repository.updateStep.mockResolvedValue({
      count: 1,
    });

    const result = await service.failStep(
      companyId,
      workflowRunId,
      workflowStepId,
      "step failed",
    );

    expect(result.status).toBe(WorkflowStatus.FAILED);

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          workflowStepId,
          changedFields: [
            "status",
            "error",
            "completedAt",
          ],
        },
      }),
    );
  });

  it("rejects completing a step that is not RUNNING", async () => {
    repository.findStep.mockResolvedValue(sampleStep);

    await expect(
      service.completeStep(
        companyId,
        workflowRunId,
        workflowStepId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("completes a RUNNING run", async () => {
    const runningRun = {
      ...sampleRun,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };
    const completedRun = {
      ...runningRun,
      status: WorkflowStatus.COMPLETED,
      output: { done: true },
      completedAt: new Date(),
    };

    repository.findRun
      .mockResolvedValueOnce(runningRun)
      .mockResolvedValueOnce(completedRun);
    repository.updateRun.mockResolvedValue({
      count: 1,
    });

    const result = await service.completeRun(
      companyId,
      workflowRunId,
      { done: true },
    );

    expect(result.status).toBe(WorkflowStatus.COMPLETED);
  });

  it("fails a RUNNING run", async () => {
    const runningRun = {
      ...sampleRun,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };
    const failedRun = {
      ...runningRun,
      status: WorkflowStatus.FAILED,
      error: "run failed",
      completedAt: new Date(),
    };

    repository.findRun
      .mockResolvedValueOnce(runningRun)
      .mockResolvedValueOnce(failedRun);
    repository.updateRun.mockResolvedValue({
      count: 1,
    });

    const result = await service.failRun(
      companyId,
      workflowRunId,
      "run failed",
    );

    expect(result.status).toBe(WorkflowStatus.FAILED);
  });

  it("cancels a PENDING run", async () => {
    const cancelledRun = {
      ...sampleRun,
      status: WorkflowStatus.CANCELLED,
      completedAt: new Date(),
    };

    repository.findRun
      .mockResolvedValueOnce(sampleRun)
      .mockResolvedValueOnce(cancelledRun);
    repository.updateRun.mockResolvedValue({
      count: 1,
    });

    const result = await service.cancelRun(
      companyId,
      workflowRunId,
    );

    expect(result.status).toBe(WorkflowStatus.CANCELLED);
  });

  it("cancels a RUNNING run", async () => {
    const runningRun = {
      ...sampleRun,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };
    const cancelledRun = {
      ...runningRun,
      status: WorkflowStatus.CANCELLED,
      completedAt: new Date(),
    };

    repository.findRun
      .mockResolvedValueOnce(runningRun)
      .mockResolvedValueOnce(cancelledRun);
    repository.updateRun.mockResolvedValue({
      count: 1,
    });

    const result = await service.cancelRun(
      companyId,
      workflowRunId,
    );

    expect(result.status).toBe(WorkflowStatus.CANCELLED);
  });

  it("rejects cancelling a COMPLETED run", async () => {
    repository.findRun.mockResolvedValue({
      ...sampleRun,
      status: WorkflowStatus.COMPLETED,
      completedAt: new Date(),
    });

    await expect(
      service.cancelRun(
        companyId,
        workflowRunId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects cancelling a FAILED run", async () => {
    repository.findRun.mockResolvedValue({
      ...sampleRun,
      status: WorkflowStatus.FAILED,
      error: "failed",
      completedAt: new Date(),
    });

    await expect(
      service.cancelRun(
        companyId,
        workflowRunId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects cancelling a CANCELLED run", async () => {
    repository.findRun.mockResolvedValue({
      ...sampleRun,
      status: WorkflowStatus.CANCELLED,
      completedAt: new Date(),
    });

    await expect(
      service.cancelRun(
        companyId,
        workflowRunId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects run operations for another tenant", async () => {
    repository.findRun.mockResolvedValue(null);

    await expect(
      service.startRun(
        otherCompanyId,
        workflowRunId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.completeRun(
        otherCompanyId,
        workflowRunId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.failRun(
        otherCompanyId,
        workflowRunId,
        "error",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.cancelRun(
        otherCompanyId,
        workflowRunId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects step operations for another tenant", async () => {
    repository.findRun.mockResolvedValue({
      ...sampleRun,
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    });
    repository.findStep.mockResolvedValue(null);

    await expect(
      service.startStep(
        otherCompanyId,
        workflowRunId,
        workflowStepId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.completeStep(
        otherCompanyId,
        workflowRunId,
        workflowStepId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.failStep(
        otherCompanyId,
        workflowRunId,
        workflowStepId,
        "error",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
