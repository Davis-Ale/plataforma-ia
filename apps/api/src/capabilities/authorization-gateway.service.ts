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
  ) {}

  async execute(
    context: CapabilityContext,
    request: CapabilityRequest,
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

    const trustedContext = Object.freeze({
      companyId: context.companyId,
      userId: context.userId,
      sessionId: context.sessionId,
    });
    const capability = this.registry.resolve(request.capability);
    const approvalId = request.approvalId;
    if (!capability || capability.allowedRoles.length === 0) {
      return { success: false, error: "DENIED" };
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
      });
      if (gate !== undefined) {
        return gate;
      }
    } catch {
      return { success: false, error: "DENIED" };
    }

    try {
      return {
        success: true,
        output: await capability.execute(authorizedContext, input),
      };
    } catch {
      return { success: false, error: "EXECUTION_FAILED" };
    }
  }
}
