import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, WorkflowCheckpointState, WorkflowReplaySafety } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { hashWorkflowRequest } from "@plataforma/workflows";
import { randomUUID } from "node:crypto";
import { CapabilityContext } from "../capabilities/capability.types";

const executionInclude = {
  run: true,
  checkpoints: { include: { step: true }, orderBy: { step: { stepOrder: "asc" as const } } },
} satisfies Prisma.WorkflowExecutionInclude;

export type DurableExecution = Prisma.WorkflowExecutionGetPayload<{ include: typeof executionInclude }>;
export type ExecutionStepPlan = Readonly<{ stepKey: string; capabilityKey: string; integrationKind: string }>;

@Injectable()
export class ExecutionIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async open(context: CapabilityContext, workflowKey: string, input: Prisma.InputJsonValue,
    operationId: string, version: string, plan: readonly ExecutionStepPlan[]) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, context);
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${context.companyId} FOR UPDATE`;
      const requestHash = hashWorkflowRequest(workflowKey, input);
      const existing = await tx.workflowRun.findUnique({
        where: { companyId_operationId: { companyId: context.companyId, operationId } },
      });
      if (existing) {
        if (existing.workflowKey !== workflowKey || existing.requestHash !== requestHash) {
          throw new ConflictException("Workflow operation conflict");
        }
        return existing;
      }
      const run = await tx.workflowRun.create({ data: {
        companyId: context.companyId, workflowKey, operationId, input, requestHash,
        correlationId: context.correlationId ?? randomUUID(),
      } });
      await tx.workflowExecution.create({ data: {
        workflowRunId: run.id, companyId: context.companyId, requestedByUserId: context.userId,
        workflowVersion: version, maxAttempts: 3, leaseMs: 60000,
      } });
      for (const [index, item] of plan.entries()) {
        const step = await tx.workflowStep.create({ data: {
          companyId: context.companyId, workflowRunId: run.id, stepKey: item.stepKey, stepOrder: index + 1,
        } });
        await tx.workflowCheckpoint.create({ data: {
          workflowStepId: step.id, companyId: context.companyId, workflowRunId: run.id,
          capabilityKey: item.capabilityKey, integrationKind: item.integrationKind,
        } });
      }
      await this.audit(tx, context, run.id, "CREATED", { correlationId: run.correlationId });
      return run;
    });
  }

  async claim(context: CapabilityContext, runId: string, version: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, context);
      let execution = await this.lock(tx, context.companyId, runId);
      if (execution.requestedByUserId !== context.userId) throw new ForbiddenException("Only the original requester can resume");
      if (execution.workflowVersion !== version) throw new ConflictException("Workflow version is not supported");
      if (execution.run.status === "CANCELLED") return { execution, token: null, blocked: "CANCELLED" as const };
      const now = await this.now(tx);
      execution = await this.expire(tx, context, execution, now);
      if (execution.state === "COMPLETED") return { execution, token: null };
      if (execution.state === "RUNNING") return { execution, token: null, blocked: "EXECUTION_IN_PROGRESS" as const };
      if (execution.attemptCount >= execution.maxAttempts) return { execution, token: null, blocked: "ATTEMPT_LIMIT" as const };
      if (execution.checkpoints.some((checkpoint) => checkpoint.state === "UNKNOWN" && checkpoint.replaySafety === "MANUAL")) {
        return { execution, token: null, blocked: "RECONCILIATION_REQUIRED" as const };
      }
      for (const checkpoint of execution.checkpoints.filter((item) => item.state === "APPROVAL_REQUIRED")) {
        const approval = checkpoint.approvalId && await tx.capabilityApproval.findFirst({ where: {
          id: checkpoint.approvalId, companyId: context.companyId, requestedByUserId: context.userId,
          capabilityKey: checkpoint.capabilityKey, purpose: "EXECUTION", status: "APPROVED",
        } });
        if (!approval) return { execution, token: null, blocked: "APPROVAL_REQUIRED" as const };
      }
      const token = randomUUID();
      await tx.workflowExecution.update({ where: { workflowRunId: runId }, data: {
        state: "RUNNING", attemptCount: { increment: 1 }, leaseToken: token,
        heartbeatAt: now, leaseUntil: new Date(now.getTime() + execution.leaseMs),
      } });
      await tx.workflowRun.update({ where: { id: runId }, data: {
        status: "RUNNING", startedAt: execution.run.startedAt ?? now, completedAt: null, error: null,
      } });
      await this.audit(tx, context, runId, "CLAIMED", { attemptNumber: execution.attemptCount + 1 });
      return { execution: await this.lock(tx, context.companyId, runId), token };
    });
  }

  async inspect(context: CapabilityContext, runId: string) {
    return this.prisma.$transaction(async (tx) => {
      const role = await this.authorize(tx, context);
      const execution = await this.lock(tx, context.companyId, runId);
      if (execution.requestedByUserId !== context.userId && role === "MEMBER") throw new ForbiddenException("Inspection is not allowed");
      const updated = await this.expire(tx, context, execution, await this.now(tx));
      return { workflowRunId: runId, state: updated.state };
    });
  }

  async heartbeat(context: CapabilityContext, runId: string, token: string) {
    return this.prisma.$transaction(async (tx) => {
      const execution = await this.owned(tx, context, runId, token);
      const now = await this.now(tx);
      await tx.workflowExecution.update({ where: { workflowRunId: runId }, data: {
        heartbeatAt: now, leaseUntil: new Date(now.getTime() + execution.leaseMs),
      } });
    });
  }

  async dispatch(context: CapabilityContext, runId: string, token: string, stepId: string,
    adapterKey: string, replaySafety: WorkflowReplaySafety) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, context);
      const execution = await this.owned(tx, context, runId, token);
      const checkpoint = execution.checkpoints.find((item) => item.workflowStepId === stepId);
      if (!checkpoint || checkpoint.state === "COMPLETED") throw new ConflictException("Step cannot be dispatched");
      if (checkpoint.adapterKey !== null && checkpoint.adapterKey !== adapterKey) throw new ConflictException("Integration binding changed");
      if (checkpoint.state === "UNKNOWN" && (checkpoint.replaySafety === "MANUAL" || replaySafety === "MANUAL")) {
        throw new ConflictException("Step requires reconciliation");
      }
      await tx.workflowCheckpoint.update({ where: { workflowStepId: stepId }, data: {
        adapterKey, replaySafety, state: "DISPATCHED", attemptCount: { increment: 1 },
        ...(checkpoint.state === "UNKNOWN" ? { approvalId: null } : {}),
      } });
      await tx.workflowStep.update({ where: { id: stepId }, data: {
        status: "RUNNING", error: null, startedAt: new Date(), completedAt: null,
      } });
      await this.audit(tx, context, runId, "STEP_DISPATCHED", { workflowStepId: stepId, capabilityKey: checkpoint.capabilityKey });
    });
  }

  async checkpoint(context: CapabilityContext, runId: string, token: string, stepId: string, output: Prisma.InputJsonValue) {
    return this.prisma.$transaction(async (tx) => {
      const execution = await this.owned(tx, context, runId, token);
      if (!execution.checkpoints.some((item) => item.workflowStepId === stepId && item.state === "DISPATCHED")) {
        throw new ConflictException("Step is not dispatched");
      }
      await tx.workflowStep.update({ where: { id: stepId }, data: { status: "COMPLETED", output, error: null, completedAt: new Date() } });
      await tx.workflowCheckpoint.update({ where: { workflowStepId: stepId }, data: { state: "COMPLETED", approvalId: null } });
      if (typeof output === "object" && output !== null && !Array.isArray(output) && (output as Record<string, unknown>).simulated === true) {
        await tx.workflowExecution.update({ where: { workflowRunId: runId }, data: { simulated: true } });
      }
      await this.audit(tx, context, runId, "STEP_COMPLETED", { workflowStepId: stepId });
    });
  }

  async halt(context: CapabilityContext, runId: string, token: string, stepId: string | null,
    code: "DENIED" | "INVALID_INPUT" | "APPROVAL_REQUIRED" | "EXECUTION_FAILED" | "INTEGRATION_UNAVAILABLE" | "CHECKPOINT_ACCESS_DENIED",
    approvalId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const execution = await this.owned(tx, context, runId, token);
      if (stepId !== null) {
        const checkpoint = execution.checkpoints.find((item) => item.workflowStepId === stepId);
        if (!checkpoint || checkpoint.state === "COMPLETED") throw new ConflictException("Completed step cannot be changed");
        const state: WorkflowCheckpointState = code === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED"
          : code === "EXECUTION_FAILED" ? "UNKNOWN" : "DENIED";
        await tx.workflowCheckpoint.update({ where: { workflowStepId: stepId }, data: { state, approvalId: approvalId ?? null } });
        await tx.workflowStep.update({ where: { id: stepId }, data: { status: "FAILED", error: code, completedAt: new Date() } });
      }
      await this.incident(tx, context, execution, stepId, code);
      await tx.workflowExecution.update({ where: { workflowRunId: runId }, data: {
        state: code === "APPROVAL_REQUIRED" ? "WAITING" : "FAILED", leaseToken: null, leaseUntil: null,
      } });
      await tx.workflowRun.update({ where: { id: runId }, data: { status: "FAILED", error: code, completedAt: new Date() } });
      await this.audit(tx, context, runId, "HALTED", { code, workflowStepId: stepId });
    });
  }

  async finish(context: CapabilityContext, runId: string, token: string, output: Prisma.InputJsonValue) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, context);
      const execution = await this.owned(tx, context, runId, token);
      if (execution.checkpoints.length === 0 || execution.checkpoints.some((item) => item.state !== "COMPLETED" || item.step.status !== "COMPLETED")) {
        throw new ConflictException("Workflow has unfinished steps");
      }
      const now = await this.now(tx);
      await tx.workflowExecution.update({ where: { workflowRunId: runId }, data: { state: "COMPLETED", leaseToken: null, leaseUntil: null } });
      await tx.workflowRun.update({ where: { id: runId }, data: { status: "COMPLETED", output, error: null, completedAt: now } });
      await tx.workflowIncident.updateMany({ where: { companyId: context.companyId, workflowRunId: runId, resolvedAt: null }, data: { resolvedAt: now } });
      await this.audit(tx, context, runId, "COMPLETED", { attemptNumber: execution.attemptCount });
    });
  }

  private async authorize(tx: Prisma.TransactionClient, context: CapabilityContext) {
    if (!context || ![context.companyId, context.userId, context.sessionId].every((value) => typeof value === "string" && value.trim() !== "")) {
      throw new ForbiddenException("Authenticated execution context is required");
    }
    const membership = await tx.companyUser.findFirst({ where: {
      companyId: context.companyId, userId: context.userId, status: "ACTIVE", company: { status: "ACTIVE" },
      user: { status: "ACTIVE", sessions: { some: { id: context.sessionId, userId: context.userId, revokedAt: null, expiresAt: { gt: new Date() } } } },
    }, select: { role: true } });
    if (!membership) throw new ForbiddenException("Execution is not authorized");
    return membership.role;
  }

  private async lock(tx: Prisma.TransactionClient, companyId: string, runId: string): Promise<DurableExecution> {
    await tx.$queryRaw`SELECT id FROM workflow_runs WHERE id = ${runId} AND company_id = ${companyId} FOR UPDATE`;
    const execution = await tx.workflowExecution.findFirst({ where: { companyId, workflowRunId: runId }, include: executionInclude });
    if (!execution) throw new NotFoundException("Managed workflow execution not found");
    return execution;
  }

  private async owned(tx: Prisma.TransactionClient, context: CapabilityContext, runId: string, token: string) {
    const execution = await this.lock(tx, context.companyId, runId);
    const now = await this.now(tx);
    if (execution.requestedByUserId !== context.userId || execution.state !== "RUNNING" || execution.leaseToken !== token ||
      execution.leaseUntil === null || execution.leaseUntil <= now || execution.run.status !== "RUNNING") {
      throw new ConflictException("Execution lease is no longer valid");
    }
    return execution;
  }

  private async expire(tx: Prisma.TransactionClient, context: CapabilityContext, execution: DurableExecution, now: Date) {
    if (execution.run.status === "CANCELLED" || execution.state !== "RUNNING" || (execution.leaseUntil !== null && execution.leaseUntil > now)) return execution;
    const dispatched = execution.checkpoints.find((item) => item.state === "DISPATCHED");
    for (const checkpoint of execution.checkpoints.filter((item) => item.state === "DISPATCHED")) {
      await tx.workflowCheckpoint.update({ where: { workflowStepId: checkpoint.workflowStepId }, data: { state: "UNKNOWN" } });
      await tx.workflowStep.update({ where: { id: checkpoint.workflowStepId }, data: { status: "FAILED", error: "EXECUTION_INTERRUPTED", completedAt: now } });
    }
    await this.incident(tx, context, execution, dispatched?.workflowStepId ?? null, "EXECUTION_INTERRUPTED");
    await tx.workflowExecution.update({ where: { workflowRunId: execution.workflowRunId }, data: { state: "FAILED", leaseToken: null, leaseUntil: null } });
    await tx.workflowRun.update({ where: { id: execution.workflowRunId }, data: { status: "FAILED", error: "EXECUTION_INTERRUPTED", completedAt: now } });
    await this.audit(tx, context, execution.workflowRunId, "INTERRUPTED", { attemptNumber: execution.attemptCount });
    return this.lock(tx, context.companyId, execution.workflowRunId);
  }

  private incident(tx: Prisma.TransactionClient, context: CapabilityContext, execution: DurableExecution, stepId: string | null, code: string) {
    return tx.workflowIncident.upsert({
      where: { companyId_workflowRunId_attemptNumber: {
        companyId: context.companyId, workflowRunId: execution.workflowRunId, attemptNumber: execution.attemptCount,
      } },
      create: { companyId: context.companyId, workflowRunId: execution.workflowRunId, workflowStepId: stepId, attemptNumber: execution.attemptCount, code },
      update: {},
    });
  }

  private async now(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    return rows[0]!.now;
  }

  private audit(tx: Prisma.TransactionClient, context: CapabilityContext, runId: string, event: string, metadata: Prisma.InputJsonObject = {}) {
    return tx.auditLog.create({ data: {
      companyId: context.companyId, userId: context.userId, action: event === "CREATED" ? "CREATE" : "UPDATE",
      resource: "workflow_execution", resourceId: runId, metadata: { event, ...metadata },
    } });
  }
}
