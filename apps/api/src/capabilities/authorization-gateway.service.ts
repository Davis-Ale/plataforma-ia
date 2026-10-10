import { randomUUID } from "node:crypto";
import { prepareContext } from "../context-engine/context-engine";
import { ContextRequest, PreparedContext } from "../context-engine/context.types";
import { ProcessObservabilityService } from "../observability/process-observability.service";
import { buildProcessObservation } from "../observability/process-observation";
import { Injectable } from "@nestjs/common";
import {
  CompanyStatus,
  CompanyUserStatus,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { CapabilityRegistry } from "./capability-registry.service";
import { HumanApprovalService } from "./human-approval.service";
import { createImmutableInput } from "./immutable-input";
import {
  AuthorizedCapabilityContext,
  ApprovalPurpose,
  CapabilityContext,
  CapabilityRequest,
  CapabilityResult,
} from "./capability.types";

@Injectable()
export class AuthorizationGateway {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly prisma: PrismaService,
    private readonly humanApproval: HumanApprovalService,
    private readonly observability: ProcessObservabilityService,
  ) {}

  async execute(
    context: CapabilityContext,
    request: CapabilityRequest,
  ): Promise<CapabilityResult> {
    return this.run(context, request, "EXECUTION");
  }

  async prepareContext(context: CapabilityContext, request: ContextRequest): Promise<CapabilityResult<PreparedContext>> {
    return this.run(context, request, "CONTEXT_PREPARATION") as Promise<CapabilityResult<PreparedContext>>;
  }

  async prepareGenerationContext(context: CapabilityContext, request: ContextRequest): Promise<CapabilityResult<PreparedContext>> {
    return this.run(context, request, "GENERATION") as Promise<CapabilityResult<PreparedContext>>;
  }

  private async run(
    context: CapabilityContext,
    request: ContextRequest,
    mode: ApprovalPurpose,
  ): Promise<CapabilityResult> {
    if (
      !context ||
      ![context.companyId, context.userId, context.sessionId].every(
        (value) => typeof value === "string" && value.trim() !== "",
      ) ||
      !request ||
      typeof request.capability !== "string"
    ) {
      return { success: false, error: "DENIED" };
    }

    request = Object.freeze({ ...request });
    const startedAt = new Date();
    const correlationId = context.correlationId ?? randomUUID();
    const operation = mode === "EXECUTION" ? "capability.execute" : "context.prepare";
    try {
      buildProcessObservation({
        companyId: context.companyId, correlationId,
        operation, capabilityKey: request.capability,
        startedAt, completedAt: startedAt, result: "SUCCESS",
      });
    } catch {
      return { success: false, error: "DENIED" };
    }
    const trustedContext = Object.freeze({
      companyId: context.companyId,
      userId: context.userId,
      sessionId: context.sessionId,
      correlationId,
    });
    const result = await this.executeAuthorized(trustedContext, request, mode);
    await this.observability.record({
      companyId: trustedContext.companyId,
      correlationId,
      operation,
      capabilityKey: request.capability,
      startedAt,
      completedAt: new Date(),
      result: result.success ? "SUCCESS" : result.error === "DENIED" ? "DENIED"
        : result.error === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : "FAILURE",
      ...(!result.success && result.error !== "APPROVAL_REQUIRED" ? { errorCode: result.error } : {}),
    });
    return result;
  }

  private async executeAuthorized(
    trustedContext: CapabilityContext,
    request: ContextRequest,
    mode: ApprovalPurpose,
  ): Promise<CapabilityResult> {
    const capability = this.registry.resolve(request.capability);
    const approvalId = request.approvalId;
    if (!capability || capability.allowedRoles.length === 0) {
      return { success: false, error: "DENIED" };
    }
    if (mode !== "EXECUTION" && !capability.context) {
      return { success: false, error: "DENIED" };
    }
    if (mode !== "EXECUTION" && request.maxBytes !== undefined &&
      (!Number.isSafeInteger(request.maxBytes) || request.maxBytes < 2)) {
      return { success: false, error: "INVALID_INPUT" };
    }

    let authorizedContext: AuthorizedCapabilityContext;
    let input: unknown;
    try {
      input = createImmutableInput(request.input);
      const membership = await this.prisma.companyUser.findFirst({
        where: {
          companyId: trustedContext.companyId,
          userId: trustedContext.userId,
          status: CompanyUserStatus.ACTIVE,
          company: { status: CompanyStatus.ACTIVE },
          user: {
            status: UserStatus.ACTIVE,
            sessions: {
              some: {
                id: trustedContext.sessionId,
                userId: trustedContext.userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
            },
          },
        },
        select: { role: true },
      });
      if (!membership || !capability.allowedRoles.includes(membership.role)) {
        return { success: false, error: "DENIED" };
      }

      authorizedContext = Object.freeze({
        ...trustedContext,
        role: membership.role,
      });
      if (capability.validate(input) !== true) {
        return { success: false, error: "INVALID_INPUT" };
      }
      if (await capability.authorize(authorizedContext, input) !== true) {
        return { success: false, error: "DENIED" };
      }
      const gate = await this.humanApproval.gate(authorizedContext, {
        capability: capability.key,
        input,
        approvalId,
        purpose: mode,
      });
      if (gate !== undefined) {
        return gate;
      }
    } catch {
      return { success: false, error: "DENIED" };
    }

    try {
      if (mode !== "EXECUTION") {
        return { success: true, output: await prepareContext(
          authorizedContext, capability.key, input, capability.context!, request.maxBytes,
        ) };
      }
      return {
        success: true,
        output: await capability.execute(authorizedContext, input),
      };
    } catch {
      return { success: false, error: "EXECUTION_FAILED" };
    }
  }
}
