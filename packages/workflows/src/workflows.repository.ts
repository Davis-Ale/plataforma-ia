import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  WorkflowStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";

export type CreateWorkflowRunData = {
  workflowKey: string;
  input?: Prisma.InputJsonValue;
};

export type CreateWorkflowStepData = {
  stepKey: string;
  stepOrder: number;
  input?: Prisma.InputJsonValue;
};

export type UpdateWorkflowRunData = {
  status?: WorkflowStatus;
  input?: Prisma.InputJsonValue;
  output?: Prisma.InputJsonValue;
  error?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

export type UpdateWorkflowStepData = {
  status?: WorkflowStatus;
  input?: Prisma.InputJsonValue;
  output?: Prisma.InputJsonValue;
  error?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

@Injectable()
export class WorkflowsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createRun(
    companyId: string,
    data: CreateWorkflowRunData,
  ) {
    return this.prisma.workflowRun.create({
      data: {
        companyId,
        workflowKey: data.workflowKey,
        input: data.input,
        status: WorkflowStatus.PENDING,
      },
    });
  }

  findRun(companyId: string, id: string) {
    return this.prisma.workflowRun.findFirst({
      where: {
        id,
        companyId,
      },
    });
  }

  updateRun(
    companyId: string,
    id: string,
    data: UpdateWorkflowRunData,
    expectedStatus: WorkflowStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.workflowRun.updateMany({
        where: {
          id,
          companyId,
          status: expectedStatus,
        },
        data,
      });
      const record = await tx.workflowRun.findFirst({
        where: { id, companyId },
      });
      return { ...result, record };
    });
  }

  createStep(
    companyId: string,
    workflowRunId: string,
    data: CreateWorkflowStepData,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockRun(tx, companyId, workflowRunId, WorkflowStatus.PENDING);
      return tx.workflowStep.create({
        data: {
          companyId,
          workflowRunId,
          stepKey: data.stepKey,
          stepOrder: data.stepOrder,
          input: data.input,
          status: WorkflowStatus.PENDING,
        },
      });
    });
  }

  findStep(
    companyId: string,
    workflowRunId: string,
    stepId: string,
  ) {
    return this.prisma.workflowStep.findFirst({
      where: {
        id: stepId,
        companyId,
        workflowRunId,
      },
    });
  }

  updateStep(
    companyId: string,
    workflowRunId: string,
    stepId: string,
    data: UpdateWorkflowStepData,
    expectedStatus: WorkflowStatus,
    expectedRunStatus?: WorkflowStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (expectedRunStatus !== undefined) {
        await this.lockRun(tx, companyId, workflowRunId, expectedRunStatus);
      }
      const result = await tx.workflowStep.updateMany({
        where: {
          id: stepId,
          companyId,
          workflowRunId,
          status: expectedStatus,
        },
        data,
      });
      const record = await tx.workflowStep.findFirst({
        where: { id: stepId, companyId, workflowRunId },
      });
      return { ...result, record };
    });
  }

  private async lockRun(
    tx: Prisma.TransactionClient,
    companyId: string,
    workflowRunId: string,
    expectedStatus: WorkflowStatus,
  ) {
    const runs = await tx.$queryRaw<Array<{ status: WorkflowStatus }>>`
      SELECT status FROM workflow_runs
      WHERE id = ${workflowRunId} AND company_id = ${companyId}
      FOR UPDATE
    `;
    if (runs.length === 0) {
      throw new NotFoundException("Workflow run not found");
    }
    if (runs[0].status !== expectedStatus) {
      throw new BadRequestException(
        expectedStatus === WorkflowStatus.PENDING
          ? "Workflow run is not pending"
          : "Workflow run is not running",
      );
    }
  }
}
