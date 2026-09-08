import { Injectable } from "@nestjs/common";
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
  ) {
    return this.prisma.workflowRun.updateMany({
      where: {
        id,
        companyId,
      },
      data,
    });
  }

  createStep(
    companyId: string,
    workflowRunId: string,
    data: CreateWorkflowStepData,
  ) {
    return this.prisma.workflowStep.create({
      data: {
        companyId,
        workflowRunId,
        stepKey: data.stepKey,
        stepOrder: data.stepOrder,
        input: data.input,
        status: WorkflowStatus.PENDING,
      },
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
  ) {
    return this.prisma.workflowStep.updateMany({
      where: {
        id: stepId,
        companyId,
        workflowRunId,
      },
      data,
    });
  }
}
