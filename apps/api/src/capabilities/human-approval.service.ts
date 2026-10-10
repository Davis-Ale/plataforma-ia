import { Injectable } from "@nestjs/common";
import {
  AuditAction,
  CapabilityApprovalDecision,
  CapabilityApprovalStatus,
  CompanyStatus,
  CompanyUserStatus,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { createHash } from "node:crypto";
import { serialize } from "node:v8";
import { CapabilityRegistry } from "./capability-registry.service";
import { ApprovalPurpose, CapabilityApprovalRequest, CapabilityContext } from "./capability.types";
import { createImmutableInput } from "./immutable-input";

type GateResult =
  | { success: false; error: "DENIED" }
  | { success: false; error: "APPROVAL_REQUIRED"; approvalId: string }
  | undefined;

type DecisionResult =
  | { success: false; error: "DENIED" }
  | { success: true; status: CapabilityApprovalDecision };

@Injectable()
export class HumanApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CapabilityRegistry,
  ) {}

  async gate(context: CapabilityContext, request: CapabilityApprovalRequest): Promise<GateResult> {
    try {
      if (!this.validContext(context) || !request || !this.validPurpose(request.purpose)) {
        return { success: false, error: "DENIED" };
      }
      context = Object.freeze({ ...context });
      request = Object.freeze({ ...request, input: createImmutableInput(request.input) });
      const capability = this.registry.resolve(request.capability);
      if (!capability) {
        return { success: false, error: "DENIED" };
      }
      if (capability.approval?.mode === "NONE") {
        return undefined;
      }
      const policy = capability.approval;
      if (policy?.mode !== "REQUIRED" || policy.approverRoles.length === 0) {
        return { success: false, error: "DENIED" };
      }
      const role = await this.actorRole(context);
      if (!role || !capability.allowedRoles.includes(role)) {
        return { success: false, error: "DENIED" };
      }
      const inputHash = createHash("sha256").update(serialize(request.input)).digest("hex");
      if (request.approvalId === undefined) {
        const approval = await this.prisma.$transaction(async (tx) => {
          const created = await tx.capabilityApproval.create({
            data: {
              companyId: context.companyId,
              requestedByUserId: context.userId,
              capabilityKey: capability.key,
              inputHash,
              purpose: request.purpose,
            },
          });
          await tx.auditLog.create({
            data: {
              companyId: context.companyId,
              userId: context.userId,
              action: AuditAction.CREATE,
              resource: "capability_approval",
              resourceId: created.id,
              metadata: { capability: capability.key, purpose: request.purpose, status: "PENDING" },
            },
          });
          return created;
        });
        return { success: false, error: "APPROVAL_REQUIRED", approvalId: approval.id };
      }
      if (typeof request.approvalId !== "string" || request.approvalId.trim() === "") {
        return { success: false, error: "DENIED" };
      }
      const approvalId = request.approvalId;
      return await this.prisma.$transaction(async (tx): Promise<GateResult> => {
        const scope = {
          id: approvalId,
          companyId: context.companyId,
          requestedByUserId: context.userId,
          capabilityKey: capability.key,
          inputHash,
          purpose: request.purpose,
        };
        const approval = await tx.capabilityApproval.findFirst({ where: scope });
        if (approval?.status === CapabilityApprovalStatus.PENDING) {
          return { success: false, error: "APPROVAL_REQUIRED", approvalId };
        }
        const updated = await tx.capabilityApproval.updateMany({
          where: {
            ...scope,
            status: CapabilityApprovalStatus.APPROVED,
            decision: CapabilityApprovalDecision.APPROVED,
            decidedByUserId: { not: context.userId },
            decidedBy: {
              status: UserStatus.ACTIVE,
              companies: {
                some: {
                  companyId: context.companyId,
                  status: CompanyUserStatus.ACTIVE,
                  role: { in: [...policy.approverRoles] },
                  company: { status: CompanyStatus.ACTIVE },
                },
              },
            },
          },
          data: { status: CapabilityApprovalStatus.CONSUMED, consumedAt: new Date() },
        });
        if (updated.count !== 1) {
          return { success: false, error: "DENIED" };
        }
        await tx.auditLog.create({
          data: {
            companyId: context.companyId,
            userId: context.userId,
            action: AuditAction.UPDATE,
            resource: "capability_approval",
            resourceId: approvalId,
            metadata: { capability: capability.key, purpose: request.purpose, status: "CONSUMED" },
          },
        });
        return undefined;
      });
    } catch {
      return { success: false, error: "DENIED" };
    }
  }

  async decide(
    context: CapabilityContext,
    approvalId: string,
    decision: CapabilityApprovalDecision,
    purpose: ApprovalPurpose,
  ): Promise<DecisionResult> {
    try {
      if (!this.validContext(context) || !this.validPurpose(purpose)) {
        return { success: false, error: "DENIED" };
      }
      context = Object.freeze({ ...context });
      if (
        typeof approvalId !== "string" || approvalId.trim() === "" ||
        ![CapabilityApprovalDecision.APPROVED, CapabilityApprovalDecision.REJECTED].includes(decision)
      ) {
        return { success: false, error: "DENIED" };
      }
      const role = await this.actorRole(context);
      if (!role) {
        return { success: false, error: "DENIED" };
      }
      return await this.prisma.$transaction(async (tx): Promise<DecisionResult> => {
        const approval = await tx.capabilityApproval.findFirst({
          where: {
            id: approvalId,
            companyId: context.companyId,
            status: CapabilityApprovalStatus.PENDING,
            purpose,
          },
        });
        const policy = approval && this.registry.resolve(approval.capabilityKey)?.approval;
        if (
          !approval || approval.requestedByUserId === context.userId ||
          policy?.mode !== "REQUIRED" || !policy.approverRoles.includes(role)
        ) {
          return { success: false, error: "DENIED" };
        }
        const updated = await tx.capabilityApproval.updateMany({
          where: {
            id: approvalId,
            companyId: context.companyId,
            status: CapabilityApprovalStatus.PENDING,
            purpose,
          },
          data: {
            status: decision,
            decision,
            decidedByUserId: context.userId,
            decidedAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          return { success: false, error: "DENIED" };
        }
        await tx.auditLog.create({
          data: {
            companyId: context.companyId,
            userId: context.userId,
            action: AuditAction.UPDATE,
            resource: "capability_approval",
            resourceId: approvalId,
            metadata: { capability: approval.capabilityKey, purpose, status: decision, decision },
          },
        });
        return { success: true, status: decision };
      });
    } catch {
      return { success: false, error: "DENIED" };
    }
  }

  private async actorRole(context: CapabilityContext) {
    if (!this.validContext(context)) {
      return undefined;
    }
    const membership = await this.prisma.companyUser.findFirst({
      where: {
        companyId: context.companyId,
        userId: context.userId,
        status: CompanyUserStatus.ACTIVE,
        company: { status: CompanyStatus.ACTIVE },
        user: {
          status: UserStatus.ACTIVE,
          sessions: {
            some: {
              id: context.sessionId,
              userId: context.userId,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          },
        },
      },
      select: { role: true },
    });
    return membership?.role;
  }

  private validContext(context: CapabilityContext): boolean {
    return Boolean(context) &&
      [context.companyId, context.userId, context.sessionId].every(
        (value) => typeof value === "string" && value.trim() !== "",
      );
  }

  private validPurpose(purpose: unknown): purpose is ApprovalPurpose {
    return purpose === "CONTEXT_PREPARATION" || purpose === "GENERATION" || purpose === "EXECUTION";
  }
}
