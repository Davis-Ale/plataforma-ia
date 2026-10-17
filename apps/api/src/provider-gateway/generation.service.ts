import { Injectable } from "@nestjs/common";
import { CapabilityContext } from "../capabilities/capability.types";
import { ProviderBootstrapService } from "./provider-bootstrap.service";
import { ProviderGateway } from "./provider-gateway.service";
import { ProviderGatewayResult } from "./provider.types";
import { identifier, positive } from "./provider-validation";

export type GenerationRequest = Readonly<{
  capability: string;
  input: unknown;
  operationId: string;
  attemptNumber: number;
  approvalId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
}>;

@Injectable()
export class GenerationService {
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly bootstrap: ProviderBootstrapService,
  ) {}

  async generate(context: CapabilityContext, request: GenerationRequest): Promise<ProviderGatewayResult> {
    if (
      !context ||
      ![context.companyId, context.userId, context.sessionId].every(identifier) ||
      !request ||
      !identifier(request.capability) ||
      !identifier(request.operationId) ||
      !positive(request.attemptNumber, 2_147_483_647)
    ) {
      return { success: false, error: "DENIED" };
    }
    if (!this.bootstrap.isProviderReady()) {
      return { success: false, error: "PROVIDER_UNAVAILABLE" };
    }
    return this.gateway.generate(context, {
      capability: request.capability,
      input: request.input,
      operationId: request.operationId,
      attemptNumber: request.attemptNumber,
      approvalId: request.approvalId,
      workflowRunId: request.workflowRunId,
      workflowStepId: request.workflowStepId,
    });
  }
}
