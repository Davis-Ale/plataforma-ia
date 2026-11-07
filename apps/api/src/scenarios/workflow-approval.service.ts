import { ForbiddenException, Injectable } from "@nestjs/common";
import { CapabilityApproval, CapabilityApprovalDecision, Prisma } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { createHash } from "node:crypto";
import { serialize } from "node:v8";
import { CapabilityRegistry } from "../capabilities/capability-registry.service";
import { CapabilityContext } from "../capabilities/capability.types";
import { HumanApprovalService } from "../capabilities/human-approval.service";
import { createImmutableInput } from "../capabilities/immutable-input";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { PREPARE_OPERATION_STEPS, PREPARE_OPERATION_VERSION, PREPARE_OPERATION_WORKFLOW_KEY, prepareOperationStepInput } from "./prepare-operation.definition";

type Database = Prisma.TransactionClient | PrismaService;
export type WorkflowApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
type Review = {
  workflowRunId: string; workflowKey: string; stepKey: string; operationId: string;
  fields: Array<{ label: string; value: string }>;
  token: string;
};

const fieldLabels: Record<string, string> = {
  externalRef: "Referência do contrato", contractExternalRef: "Referência do contrato", contractName: "Contrato",
  clientName: "Cliente", startDate: "Data de início", planId: "Identificador do plano",
  workstreams: "Frentes de trabalho", targetStartDate: "Data prevista de início",
};

@Injectable()
export class WorkflowApprovalService {
  constructor(private readonly prisma: PrismaService, private readonly registry: CapabilityRegistry,
    private readonly approvals: HumanApprovalService, private readonly authorization: AuthorizationGateway) {}

  async list(context: CapabilityContext, page = 1, status: WorkflowApprovalStatus = "PENDING") {
    const role = await this.approvals.actorRole(context);
    if (!role) throw new ForbiddenException("Approval access is not authorized");
    const where: Prisma.CapabilityApprovalWhereInput = {
      companyId: context.companyId, purpose: "EXECUTION", status,
      OR: [{ requestedByUserId: context.userId }, { capabilityKey: { in: [...this.registry.approvalKeysFor(role)] } }],
    };
    const limit = 20;
    const [records, total] = await this.prisma.$transaction([
      this.prisma.capabilityApproval.findMany({ where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { requestedBy: { select: { name: true } } } }),
      this.prisma.capabilityApproval.count({ where }),
    ]);
    const items = await Promise.all(records.map(async (record) => {
      const review = await this.review(this.prisma, record, context);
      const policy = this.registry.resolve(record.capabilityKey)?.approval;
      return {
        id: record.id, capabilityKey: record.capabilityKey, status: record.status, createdAt: record.createdAt,
        decidedAt: record.decidedAt, requestedByYou: record.requestedByUserId === context.userId,
        requestedBy: { id: record.requestedByUserId, name: record.requestedBy.name }, review,
        canDecide: record.status === "PENDING" && record.requestedByUserId !== context.userId &&
          policy?.mode === "REQUIRED" && policy.approverRoles.includes(role) && review !== null,
      };
    }));
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async decide(context: CapabilityContext, id: string, decision: CapabilityApprovalDecision, token: string) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new ForbiddenException("Approval review is required");
    const result = await this.approvals.decide(context, id, decision, "EXECUTION", {
      verify: async (tx, approval) => {
        const review = await this.review(tx, approval, context, true);
        return review !== null && review.token === token;
      },
      afterDecision: async (tx, approval) => {
        if (decision !== "REJECTED") return;
        const checkpoint = await tx.workflowCheckpoint.findFirstOrThrow({ where: { companyId: context.companyId, approvalId: approval.id } });
        const execution = await tx.workflowExecution.updateMany({ where: { workflowRunId: checkpoint.workflowRunId, companyId: context.companyId, state: "WAITING" }, data: { state: "FAILED" } });
        const run = await tx.workflowRun.updateMany({ where: { id: checkpoint.workflowRunId, companyId: context.companyId, status: "FAILED" }, data: { error: "APPROVAL_REJECTED" } });
        const step = await tx.workflowStep.updateMany({ where: { id: checkpoint.workflowStepId, companyId: context.companyId, status: "FAILED" }, data: { error: "APPROVAL_REJECTED" } });
        if (execution.count !== 1 || run.count !== 1 || step.count !== 1) throw new Error("Workflow approval context changed");
        await tx.auditLog.create({ data: { companyId: context.companyId, userId: context.userId, action: "UPDATE", resource: "workflow_execution",
          resourceId: checkpoint.workflowRunId, metadata: { event: "APPROVAL_REJECTED", approvalId: approval.id, workflowStepId: checkpoint.workflowStepId } } });
      },
    });
    if (!result.success) throw new ForbiddenException("Approval decision is not authorized or no longer reviewable");
    return result;
  }

  private async review(db: Database, approval: CapabilityApproval, context: CapabilityContext, lock = false): Promise<Review | null> {
    try {
      if (approval.purpose !== "EXECUTION") return null;
      const policy = this.registry.resolve(approval.capabilityKey)?.approval;
      if (policy?.mode !== "REQUIRED") return null;
      const link = await db.workflowCheckpoint.findFirst({ where: { companyId: approval.companyId, approvalId: approval.id },
        select: { workflowStepId: true, workflowRunId: true } });
      if (!link) return null;
      if (lock) await db.$queryRaw`SELECT id FROM workflow_runs WHERE id = ${link.workflowRunId} AND company_id = ${approval.companyId} FOR UPDATE`;
      const checkpoint = await db.workflowCheckpoint.findFirst({ where: {
        workflowStepId: link.workflowStepId, companyId: approval.companyId, approvalId: approval.id,
        state: "APPROVAL_REQUIRED", capabilityKey: approval.capabilityKey,
        execution: { requestedByUserId: approval.requestedByUserId, state: { in: ["WAITING", "FAILED"] },
          requestedBy: { status: "ACTIVE", companies: { some: { companyId: approval.companyId, status: "ACTIVE" } } } },
      }, include: { execution: { include: { run: true, checkpoints: {
        include: { step: true }, orderBy: { step: { stepOrder: "asc" } },
      } } } } });
      if (!checkpoint) return null;
      const { execution } = checkpoint;
      const { run, checkpoints } = execution;
      if (approval.status === "REJECTED") {
        if (execution.state !== "FAILED" || run.error !== "APPROVAL_REJECTED") return null;
      } else {
        const blockedBeforeDispatch = approval.status === "APPROVED" && execution.state === "FAILED" && run.error === "INTEGRATION_UNAVAILABLE";
        if ((execution.state !== "WAITING" && !blockedBeforeDispatch) || execution.attemptCount >= execution.maxAttempts) return null;
      }
      if (run.companyId !== approval.companyId || run.status !== "FAILED" || run.workflowKey !== PREPARE_OPERATION_WORKFLOW_KEY ||
        execution.workflowVersion !== PREPARE_OPERATION_VERSION || checkpoints.length !== PREPARE_OPERATION_STEPS.length) return null;
      const index = checkpoints.findIndex((item) => item.workflowStepId === checkpoint.workflowStepId);
      if (index < 0) return null;
      const outputs: unknown[] = [];
      for (const [position, definition] of PREPARE_OPERATION_STEPS.entries()) {
        const item = checkpoints[position];
        if (item.companyId !== approval.companyId || item.capabilityKey !== definition.capabilityKey || item.step.stepKey !== definition.stepKey ||
          item.integrationKind !== definition.integrationKind || item.step.stepOrder !== position + 1) return null;
        if (position < index) {
          const output = item.step.output as Record<string, unknown> | null;
          if (item.state !== "COMPLETED" || item.step.status !== "COMPLETED" || !output ||
            output.companyId !== approval.companyId || output.sourceAdapter !== item.adapterKey) return null;
          outputs.push(output);
        }
      }
      const input = createImmutableInput(prepareOperationStepInput(index, run.input, outputs));
      const capability = this.registry.resolve(approval.capabilityKey);
      if (!capability || !capability.validate(input) || createHash("sha256").update(serialize(input)).digest("hex") !== approval.inputHash) return null;
      if (!await this.authorization.canAccessCheckpoint(context, { capability: approval.capabilityKey, input })) return null;
      const fields: Review["fields"] = [];
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!fieldLabels[key]) return null;
        let text: string;
        if (typeof value === "string") text = value;
        else if (Array.isArray(value) && value.length <= 32 && value.every((item) => typeof item === "string")) text = value.join(", ");
        else return null;
        if (Buffer.byteLength(text, "utf8") > 2048) return null;
        fields.push({ label: fieldLabels[key], value: text });
      }
      if (Buffer.byteLength(JSON.stringify(fields), "utf8") > 8192) return null;
      const data = { workflowRunId: run.id, workflowKey: run.workflowKey, stepKey: PREPARE_OPERATION_STEPS[index].stepKey,
        operationId: run.operationId, fields };
      const token = createHash("sha256").update(JSON.stringify({ ...data, approvalId: approval.id,
        companyId: approval.companyId, requester: approval.requestedByUserId, inputHash: approval.inputHash,
        version: execution.workflowVersion, stepId: checkpoint.workflowStepId,
        approverRoles: [...policy.approverRoles].sort(), allowedRoles: [...capability.allowedRoles].sort() })).digest("hex");
      return { ...data, token };
    } catch {
      return null;
    }
  }
}
