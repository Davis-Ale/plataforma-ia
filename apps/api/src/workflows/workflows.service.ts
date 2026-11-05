import { Injectable } from "@nestjs/common";
import {
  AuditAction,
  Prisma,
  WorkflowRun,
  WorkflowStep,
} from "@prisma/client";
import {
  CreateWorkflowStepData,
  WorkflowExecutionIdentity,
  WorkflowsService as WorkflowsEngineService,
} from "@plataforma/workflows";
import { AuditService } from "../audit/audit.service";
import { buildProcessObservation } from "../observability/process-observation";
import { FindWorkflowRunsQueryDto } from "./dto/find-workflow-runs-query.dto";

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly workflowsEngine: WorkflowsEngineService,
    private readonly auditService: AuditService,
  ) {}

  async createRun(
    companyId: string,
    workflowKey: string,
    input: Prisma.InputJsonValue | undefined,
    identity: WorkflowExecutionIdentity,
  ) {
    const result = await this.workflowsEngine.createRun(
      companyId,
      workflowKey,
      input,
      identity,
    );

    if (result.created) {
      await this.auditService.create({
        companyId,
        action: AuditAction.CREATE,
        resource: "workflow",
        resourceId: result.run.id,
        metadata: {
          correlationId: result.run.correlationId,
          workflowKey: result.run.workflowKey,
          status: result.run.status,
        },
      });
    }

    return result;
  }

  async findAll(
    companyId: string,
    query: FindWorkflowRunsQueryDto,
  ) {
    const page = this.toPositiveNumber(query.page, 1);
    const requestedLimit = this.toPositiveNumber(query.limit, 20);
    const limit = Math.min(requestedLimit, 100);
    const skip = (page - 1) * limit;
    const [items, total] = await this.workflowsEngine.listRuns(
      companyId,
      query.status,
      skip,
      limit,
    );

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findOne(
    companyId: string,
    workflowRunId: string,
  ) {
    return this.workflowsEngine.getRunDetails(
      companyId,
      workflowRunId,
    );
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
      step,
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
      step,
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
      run,
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
      run,
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
      run,
    );

    return run;
  }

  private async auditRunUpdate(
    companyId: string,
    workflowRunId: string,
    data: Record<string, unknown>,
    record?: WorkflowRun,
  ) {
    const correlationId = await this.resolveCorrelationId(
      companyId,
      workflowRunId,
      record,
    );
    await this.auditService.create({
      companyId,
      action: AuditAction.UPDATE,
      resource: "workflow",
      resourceId: workflowRunId,
      metadata: {
        correlationId,
        ...(record ? { observation: this.observeWorkflow(record, correlationId) } : {}),
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
    record?: WorkflowStep,
  ) {
    const correlationId = await this.resolveCorrelationId(
      companyId,
      workflowRunId,
    );
    await this.auditService.create({
      companyId,
      action: AuditAction.UPDATE,
      resource: "workflow",
      resourceId: workflowRunId,
      metadata: {
        correlationId,
        workflowStepId,
        ...(record ? { observation: this.observeWorkflow(record, correlationId) } : {}),
        changedFields: Object.keys(data).filter(
          (key) => data[key] !== undefined,
        ),
      },
    });
  }

  private async resolveCorrelationId(
    companyId: string,
    workflowRunId: string,
    record?: WorkflowRun,
  ) {
    if (record !== undefined) {
      return record.correlationId;
    }
    const run = await this.workflowsEngine.getRun(companyId, workflowRunId);
    return run.correlationId;
  }

  private observeWorkflow(
    record: WorkflowRun | WorkflowStep,
    correlationId: string,
  ) {
    const workflowRunId = "workflowRunId" in record ? record.workflowRunId : record.id;
    return buildProcessObservation({
      companyId: record.companyId,
      correlationId,
      operation: "workflowRunId" in record ? "workflow.step" : "workflow.run",
      workflowRunId,
      ...("workflowRunId" in record ? { workflowStepId: record.id } : { workflowKey: record.workflowKey }),
      startedAt: record.startedAt ?? record.createdAt,
      completedAt: record.completedAt ?? record.updatedAt,
      result: record.status === "COMPLETED" ? "SUCCESS"
        : record.status === "CANCELLED" ? "CANCELLED" : "FAILURE",
      ...(record.status === "FAILED" ? { errorCode: "WORKFLOW_FAILED" as const } : {}),
    });
  }

  private toPositiveNumber(
    value: string | undefined,
    fallback: number,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const parsed = Number(value);

    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1
    ) {
      return fallback;
    }

    return Math.floor(parsed);
  }
}
