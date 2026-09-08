import { Injectable } from "@nestjs/common";
import {
  AuditAction,
  Prisma,
} from "@prisma/client";
import {
  CreateWorkflowStepData,
  WorkflowsService as WorkflowsEngineService,
} from "@plataforma/workflows";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly workflowsEngine: WorkflowsEngineService,
    private readonly auditService: AuditService,
  ) {}

  async createRun(
    companyId: string,
    workflowKey: string,
    input?: Prisma.InputJsonValue,
  ) {
    const run = await this.workflowsEngine.createRun(
      companyId,
      workflowKey,
      input,
    );

    await this.auditService.create({
      companyId,
      action: AuditAction.CREATE,
      resource: "workflow",
      resourceId: run.id,
      metadata: {
        workflowKey: run.workflowKey,
        status: run.status,
      },
    });

    return run;
  }

  async createStep(
    companyId: string,
    workflowRunId: string,
    data: CreateWorkflowStepData,
  ) {
    return this.workflowsEngine.createStep(
      companyId,
      workflowRunId,
      data,
    );
  }

  async startRun(
    companyId: string,
    workflowRunId: string,
  ) {
    const updateData = {
      status: "RUNNING" as const,
      startedAt: new Date(),
    };

    const run = await this.workflowsEngine.startRun(
      companyId,
      workflowRunId,
    );

    await this.auditRunUpdate(
      companyId,
      run.id,
      updateData,
    );

    return run;
  }

  async startStep(
    companyId: string,
    workflowRunId: string,
    stepId: string,
  ) {
    const updateData = {
      status: "RUNNING" as const,
      startedAt: new Date(),
    };

    const step = await this.workflowsEngine.startStep(
      companyId,
      workflowRunId,
      stepId,
    );

    await this.auditStepUpdate(
      companyId,
      workflowRunId,
      step.id,
      updateData,
    );

    return step;
  }

  async completeStep(
    companyId: string,
    workflowRunId: string,
    stepId: string,
    output?: Prisma.InputJsonValue,
  ) {
    const updateData = {
      status: "COMPLETED" as const,
      output,
      completedAt: new Date(),
    };

    const step = await this.workflowsEngine.completeStep(
      companyId,
      workflowRunId,
      stepId,
      output,
    );

    await this.auditStepUpdate(
      companyId,
      workflowRunId,
      step.id,
      updateData,
    );

    return step;
  }

  async failStep(
    companyId: string,
    workflowRunId: string,
    stepId: string,
    error: string,
  ) {
    const updateData = {
      status: "FAILED" as const,
      error,
      completedAt: new Date(),
    };

    const step = await this.workflowsEngine.failStep(
      companyId,
      workflowRunId,
      stepId,
      error,
    );

    await this.auditStepUpdate(
      companyId,
      workflowRunId,
      step.id,
      updateData,
    );

    return step;
  }

  async completeRun(
    companyId: string,
    workflowRunId: string,
    output?: Prisma.InputJsonValue,
  ) {
    const updateData = {
      status: "COMPLETED" as const,
      output,
      completedAt: new Date(),
    };

    const run = await this.workflowsEngine.completeRun(
      companyId,
      workflowRunId,
      output,
    );

    await this.auditRunUpdate(
      companyId,
      run.id,
      updateData,
    );

    return run;
  }

  async failRun(
    companyId: string,
    workflowRunId: string,
    error: string,
  ) {
    const updateData = {
      status: "FAILED" as const,
      error,
      completedAt: new Date(),
    };

    const run = await this.workflowsEngine.failRun(
      companyId,
      workflowRunId,
      error,
    );

    await this.auditRunUpdate(
      companyId,
      run.id,
      updateData,
    );

    return run;
  }

  async cancelRun(
    companyId: string,
    workflowRunId: string,
  ) {
    const updateData = {
      status: "CANCELLED" as const,
      completedAt: new Date(),
    };

    const run = await this.workflowsEngine.cancelRun(
      companyId,
      workflowRunId,
    );

    await this.auditRunUpdate(
      companyId,
      run.id,
      updateData,
    );

    return run;
  }

  private async auditRunUpdate(
    companyId: string,
    workflowRunId: string,
    data: Record<string, unknown>,
  ) {
    await this.auditService.create({
      companyId,
      action: AuditAction.UPDATE,
      resource: "workflow",
      resourceId: workflowRunId,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) => data[key] !== undefined,
        ),
      },
    });
  }

  private async auditStepUpdate(
    companyId: string,
    workflowRunId: string,
    workflowStepId: string,
    data: Record<string, unknown>,
  ) {
    await this.auditService.create({
      companyId,
      action: AuditAction.UPDATE,
      resource: "workflow",
      resourceId: workflowRunId,
      metadata: {
        workflowStepId,
        changedFields: Object.keys(data).filter(
          (key) => data[key] !== undefined,
        ),
      },
    });
  }
}
