import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  WorkflowRun,
  WorkflowStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { randomUUID } from "node:crypto";
import { hashWorkflowRequest } from "./request-hash";
import {
  CreateWorkflowStepData,
  UpdateWorkflowRunData,
  UpdateWorkflowStepData,
  WorkflowsRepository,
} from "./workflows.repository";

export type WorkflowExecutionIdentity = Readonly<{
  operationId: string;
  correlationId?: string;
}>;

export type CreateWorkflowRunResult = Readonly<{
  run: WorkflowRun;
  created: boolean;
}>;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly workflowsRepository: WorkflowsRepository,
  ) {}

  async createRun(
    companyId: string,
    workflowKey: string,
    input: Prisma.InputJsonValue | undefined,
    identity: WorkflowExecutionIdentity,
  ): Promise<CreateWorkflowRunResult> {
    if (
      typeof companyId !== "string" ||
      companyId.trim() === "" ||
      typeof workflowKey !== "string" ||
      workflowKey.trim() === "" ||
      !identity ||
      typeof identity.operationId !== "string" ||
      identity.operationId.trim() === "" ||
      (identity.correlationId !== undefined &&
        (typeof identity.correlationId !== "string" ||
          identity.correlationId.trim() === ""))
    ) {
      throw new BadRequestException("Invalid workflow identity");
    }

    const operationId = identity.operationId.trim();
    const requestHash = hashWorkflowRequest(workflowKey, input);
    const existing = await this.workflowsRepository.findRunByOperationId(
      companyId,
      operationId,
    );
    if (existing !== null) {
      return this.reuseOrConflict(existing, workflowKey, requestHash);
    }

    try {
      const run = await this.workflowsRepository.createRun(companyId, {
        workflowKey,
        input,
        operationId,
        correlationId:
          identity.correlationId === undefined
            ? randomUUID()
            : identity.correlationId.trim(),
        requestHash,
      });
      return { run, created: true };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await this.workflowsRepository.findRunByOperationId(
          companyId,
          operationId,
        );
        if (raced === null) {
          throw new ConflictException("Workflow operation conflict");
        }
        return this.reuseOrConflict(raced, workflowKey, requestHash);
      }
      throw error;
    }
  }

  getRun(companyId: string, workflowRunId: string) {
    return this.findRunOrThrow(companyId, workflowRunId);
  }

  async createStep(
    companyId: string,
    workflowRunId: string,
    data: CreateWorkflowStepData,
  ) {
    const run = await this.findRunOrThrow(
      companyId,
      workflowRunId,
    );

    if (run.status !== WorkflowStatus.PENDING) {
      throw new BadRequestException(
        "Workflow run is not pending",
      );
    }

    return this.workflowsRepository.createStep(
      companyId,
      workflowRunId,
      data,
    );
  }

  async startRun(
    companyId: string,
    workflowRunId: string,
  ) {
    const run = await this.findRunOrThrow(
      companyId,
      workflowRunId,
    );

    if (run.status !== WorkflowStatus.PENDING) {
      throw new BadRequestException(
        "Workflow run cannot be started",
      );
    }

    const updateData: UpdateWorkflowRunData = {
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };

    return this.applyRunUpdate(
      companyId,
      workflowRunId,
      updateData,
      run.status,
    );
  }

  async startStep(
    companyId: string,
    workflowRunId: string,
    stepId: string,
  ) {
    const run = await this.findRunOrThrow(
      companyId,
      workflowRunId,
    );

    if (run.status !== WorkflowStatus.RUNNING) {
      throw new BadRequestException(
        "Workflow run is not running",
      );
    }

    const step = await this.findStepOrThrow(
      companyId,
      workflowRunId,
      stepId,
    );

    if (step.status !== WorkflowStatus.PENDING) {
      throw new BadRequestException(
        "Workflow step cannot be started",
      );
    }

    const updateData: UpdateWorkflowStepData = {
      status: WorkflowStatus.RUNNING,
      startedAt: new Date(),
    };

    return this.applyStepUpdate(
      companyId,
      workflowRunId,
      stepId,
      updateData,
      step.status,
      WorkflowStatus.RUNNING,
    );
  }

  async completeStep(
    companyId: string,
    workflowRunId: string,
    stepId: string,
    output?: Prisma.InputJsonValue,
  ) {
    const step = await this.findStepOrThrow(
      companyId,
      workflowRunId,
      stepId,
    );

    if (step.status !== WorkflowStatus.RUNNING) {
      throw new BadRequestException(
        "Workflow step cannot be completed",
      );
    }

    const updateData: UpdateWorkflowStepData = {
      status: WorkflowStatus.COMPLETED,
      output,
      completedAt: new Date(),
    };

    return this.applyStepUpdate(
      companyId,
      workflowRunId,
      stepId,
      updateData,
      step.status,
    );
  }

  async failStep(
    companyId: string,
    workflowRunId: string,
    stepId: string,
    error: string,
  ) {
    const step = await this.findStepOrThrow(
      companyId,
      workflowRunId,
      stepId,
    );

    if (step.status !== WorkflowStatus.RUNNING) {
      throw new BadRequestException(
        "Workflow step cannot be failed",
      );
    }

    const updateData: UpdateWorkflowStepData = {
      status: WorkflowStatus.FAILED,
      error,
      completedAt: new Date(),
    };

    return this.applyStepUpdate(
      companyId,
      workflowRunId,
      stepId,
      updateData,
      step.status,
    );
  }

  async completeRun(
    companyId: string,
    workflowRunId: string,
    output?: Prisma.InputJsonValue,
  ) {
    const run = await this.findRunOrThrow(
      companyId,
      workflowRunId,
    );

    if (run.status !== WorkflowStatus.RUNNING) {
      throw new BadRequestException(
        "Workflow run cannot be completed",
      );
    }

    const updateData: UpdateWorkflowRunData = {
      status: WorkflowStatus.COMPLETED,
      output,
      completedAt: new Date(),
    };

    return this.applyRunUpdate(
      companyId,
      workflowRunId,
      updateData,
      run.status,
    );
  }

  async failRun(
    companyId: string,
    workflowRunId: string,
    error: string,
  ) {
    const run = await this.findRunOrThrow(
      companyId,
      workflowRunId,
    );

    if (run.status !== WorkflowStatus.RUNNING) {
      throw new BadRequestException(
        "Workflow run cannot be failed",
      );
    }

    const updateData: UpdateWorkflowRunData = {
      status: WorkflowStatus.FAILED,
      error,
      completedAt: new Date(),
    };

    return this.applyRunUpdate(
      companyId,
      workflowRunId,
      updateData,
      run.status,
    );
  }

  async cancelRun(
    companyId: string,
    workflowRunId: string,
  ) {
    const run = await this.findRunOrThrow(
      companyId,
      workflowRunId,
    );

    if (
      run.status !== WorkflowStatus.PENDING &&
      run.status !== WorkflowStatus.RUNNING
    ) {
      throw new BadRequestException(
        "Workflow run cannot be cancelled",
      );
    }

    const updateData: UpdateWorkflowRunData = {
      status: WorkflowStatus.CANCELLED,
      completedAt: new Date(),
    };

    return this.applyRunUpdate(
      companyId,
      workflowRunId,
      updateData,
      run.status,
    );
  }

  private async findRunOrThrow(
    companyId: string,
    workflowRunId: string,
  ) {
    const run =
      await this.workflowsRepository.findRun(
        companyId,
        workflowRunId,
      );

    if (run === null) {
      throw new NotFoundException(
        "Workflow run not found",
      );
    }

    return run;
  }

  private async findStepOrThrow(
    companyId: string,
    workflowRunId: string,
    stepId: string,
  ) {
    const step =
      await this.workflowsRepository.findStep(
        companyId,
        workflowRunId,
        stepId,
      );

    if (step === null) {
      throw new NotFoundException(
        "Workflow step not found",
      );
    }

    return step;
  }

  private async applyRunUpdate(
    companyId: string,
    workflowRunId: string,
    data: UpdateWorkflowRunData,
    expectedStatus: WorkflowStatus,
  ) {
    const result =
      await this.workflowsRepository.updateRun(
        companyId,
        workflowRunId,
        data,
        expectedStatus,
      );

    if (result.record === null) {
      throw new NotFoundException("Workflow run not found");
    }
    if (result.count === 0) {
      throw new BadRequestException("Workflow run cannot be transitioned");
    }
    return result.record;
  }

  private async applyStepUpdate(
    companyId: string,
    workflowRunId: string,
    stepId: string,
    data: UpdateWorkflowStepData,
    expectedStatus: WorkflowStatus,
    expectedRunStatus?: WorkflowStatus,
  ) {
    const result =
      await this.workflowsRepository.updateStep(
        companyId,
        workflowRunId,
        stepId,
        data,
        expectedStatus,
        expectedRunStatus,
      );

    if (result.record === null) {
      throw new NotFoundException("Workflow step not found");
    }
    if (result.count === 0) {
      throw new BadRequestException("Workflow step cannot be transitioned");
    }
    return result.record;
  }

  private reuseOrConflict(
    existing: WorkflowRun,
    workflowKey: string,
    requestHash: string,
  ): CreateWorkflowRunResult {
    if (
      existing.workflowKey !== workflowKey ||
      existing.requestHash !== requestHash
    ) {
      throw new ConflictException("Workflow operation conflict");
    }
    return { run: existing, created: false };
  }
}
