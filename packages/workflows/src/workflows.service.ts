import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  WorkflowStatus,
} from "@prisma/client";
import {
  CreateWorkflowStepData,
  UpdateWorkflowRunData,
  UpdateWorkflowStepData,
  WorkflowsRepository,
} from "./workflows.repository";

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly workflowsRepository: WorkflowsRepository,
  ) {}

  createRun(
    companyId: string,
    workflowKey: string,
    input?: Prisma.InputJsonValue,
  ) {
    return this.workflowsRepository.createRun(
      companyId,
      {
        workflowKey,
        input,
      },
    );
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

    await this.applyRunUpdate(
      companyId,
      workflowRunId,
      updateData,
    );

    return this.findRunOrThrow(
      companyId,
      workflowRunId,
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

    await this.applyStepUpdate(
      companyId,
      workflowRunId,
      stepId,
      updateData,
    );

    return this.findStepOrThrow(
      companyId,
      workflowRunId,
      stepId,
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

    await this.applyStepUpdate(
      companyId,
      workflowRunId,
      stepId,
      updateData,
    );

    return this.findStepOrThrow(
      companyId,
      workflowRunId,
      stepId,
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

    await this.applyStepUpdate(
      companyId,
      workflowRunId,
      stepId,
      updateData,
    );

    return this.findStepOrThrow(
      companyId,
      workflowRunId,
      stepId,
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

    await this.applyRunUpdate(
      companyId,
      workflowRunId,
      updateData,
    );

    return this.findRunOrThrow(
      companyId,
      workflowRunId,
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

    await this.applyRunUpdate(
      companyId,
      workflowRunId,
      updateData,
    );

    return this.findRunOrThrow(
      companyId,
      workflowRunId,
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

    await this.applyRunUpdate(
      companyId,
      workflowRunId,
      updateData,
    );

    return this.findRunOrThrow(
      companyId,
      workflowRunId,
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
  ) {
    const result =
      await this.workflowsRepository.updateRun(
        companyId,
        workflowRunId,
        data,
      );

    if (result.count === 0) {
      throw new NotFoundException(
        "Workflow run not found",
      );
    }
  }

  private async applyStepUpdate(
    companyId: string,
    workflowRunId: string,
    stepId: string,
    data: UpdateWorkflowStepData,
  ) {
    const result =
      await this.workflowsRepository.updateStep(
        companyId,
        workflowRunId,
        stepId,
        data,
      );

    if (result.count === 0) {
      throw new NotFoundException(
        "Workflow step not found",
      );
    }
  }
}
