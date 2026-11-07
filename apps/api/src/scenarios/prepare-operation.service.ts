import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { CapabilityContext, CapabilityRequest, CapabilityResult } from "../capabilities/capability.types";
import { IntegrationResolver } from "../integrations/integration-resolver.service";
import { ExecutionIntegrityService } from "./execution-integrity.service";
import { PREPARE_OPERATION_WORKFLOW_KEY, PREPARE_OPERATION_VERSION, PREPARE_OPERATION_STEPS as plan, prepareOperationStepInput } from "./prepare-operation.definition";
export { PREPARE_OPERATION_WORKFLOW_KEY, PREPARE_OPERATION_VERSION } from "./prepare-operation.definition";


export type PrepareOperationInput = Readonly<{ contractExternalRef: string; operationId: string }>;
type CompletedStep = Readonly<{
  stepKey: string; capabilityKey: string; integrationKind: "contracts" | "operations" | "people";
  companyId: string; status: "COMPLETED"; output: unknown;
}>;
export type PrepareOperationResult =
  | Readonly<{ success: true; companyId: string; workflowRunId: string; workflowKey: string;
      steps: readonly CompletedStep[]; output: Readonly<{ contract: unknown; plan: unknown; capacity: unknown }> }>
  | Readonly<{ success: false; companyId: string; workflowRunId?: string; error: string;
      approvalId?: string; failedStep?: string; failedCapabilityKey?: string }>;

@Injectable()
export class PrepareOperationService {
  constructor(
    private readonly integrity: ExecutionIntegrityService,
    private readonly authorization: AuthorizationGateway,
    private readonly integrations: IntegrationResolver,
  ) {}

  async run(context: CapabilityContext, input: PrepareOperationInput): Promise<PrepareOperationResult> {
    if (!context || ![context.companyId, context.userId, context.sessionId].every((item) => typeof item === "string" && item.trim())) {
      return { success: false, companyId: context?.companyId ?? "", error: "DENIED" };
    }
    if (!input || ![input.contractExternalRef, input.operationId].every((item) => typeof item === "string" && item.trim())) {
      return { success: false, companyId: context.companyId, error: "INVALID_INPUT" };
    }
    const run = await this.integrity.open(context, PREPARE_OPERATION_WORKFLOW_KEY, {
      contractExternalRef: input.contractExternalRef.trim(), scenario: "new_contract", areas: ["contracts", "operations", "people"],
    }, input.operationId.trim(), PREPARE_OPERATION_VERSION, plan);
    return this.resume(context, run.id);
  }

  async resume(context: CapabilityContext, runId: string): Promise<PrepareOperationResult> {
    const claim = await this.integrity.claim(context, runId, PREPARE_OPERATION_VERSION);
    const { execution, token } = claim;
    const failure = (error: string): Extract<PrepareOperationResult, { success: false }> => ({ success: false, companyId: context.companyId, workflowRunId: runId, error });
    if (!token && claim.blocked) return failure(claim.blocked);
    if (!token && execution.state !== "COMPLETED") return failure(claim.blocked ?? "EXECUTION_IN_PROGRESS");
    if (execution.run.workflowKey !== PREPARE_OPERATION_WORKFLOW_KEY || execution.checkpoints.length !== plan.length) {
      if (token) await this.integrity.halt(context, runId, token, null, "EXECUTION_FAILED");
      return failure("EXECUTION_FAILED");
    }
    const runInput = execution.run.input as { contractExternalRef: string };
    const completed: CompletedStep[] = [];
    const outputs: unknown[] = [];
    const requests: CapabilityRequest[] = [];
    let leaseLost = false;
    let heartbeatPending = false;
    const timer = token ? setInterval(() => {
      if (heartbeatPending || leaseLost) return;
      heartbeatPending = true;
      void this.integrity.heartbeat(context, runId, token).catch(() => { leaseLost = true; }).finally(() => { heartbeatPending = false; });
    }, Math.floor(execution.leaseMs / 3)) : undefined;
    timer?.unref();
    try {
      for (const [index, definition] of plan.entries()) {
        if (leaseLost) return failure("EXECUTION_INTERRUPTED");
        const checkpoint = execution.checkpoints[index];
        if (checkpoint.capabilityKey !== definition.capabilityKey || checkpoint.step.stepKey !== definition.stepKey || checkpoint.integrationKind !== definition.integrationKind) {
          if (token) await this.integrity.halt(context, runId, token, null, "EXECUTION_FAILED");
          return failure("EXECUTION_FAILED");
        }
        const input = prepareOperationStepInput(index, runInput, outputs);
        const request = { capability: definition.capabilityKey, input,
          ...(checkpoint.state === "APPROVAL_REQUIRED" && checkpoint.approvalId ? { approvalId: checkpoint.approvalId } : {}) };
        requests.push(request);
        let output: unknown;
        if (checkpoint.state === "COMPLETED") {
          if (!await this.authorization.canAccessCheckpoint(context, request)) {
            if (token) await this.integrity.halt(context, runId, token, null, "CHECKPOINT_ACCESS_DENIED");
            return failure("DENIED");
          }
          output = checkpoint.step.output;
        } else {
          if (!token) return failure("EXECUTION_FAILED");
          const adapter = definition.integrationKind === "contracts" ? await this.integrations.resolveContracts(context.companyId)
            : definition.integrationKind === "operations" ? await this.integrations.resolveOperations(context.companyId)
            : await this.integrations.resolvePeople(context.companyId);
          if (!adapter || (checkpoint.adapterKey && checkpoint.adapterKey !== adapter.key)) {
            await this.integrity.halt(context, runId, token, checkpoint.workflowStepId, "INTEGRATION_UNAVAILABLE");
            return failure("INTEGRATION_UNAVAILABLE");
          }
          await this.integrity.dispatch(context, runId, token, checkpoint.workflowStepId, adapter.key, adapter.replaySafety ?? "MANUAL");
          let result: CapabilityResult;
          try {
            result = await this.integrations.withAdapter(context.companyId, adapter, () => this.authorization.execute(context, request));
          } catch {
            result = { success: false, error: "EXECUTION_FAILED" };
          }
          if (!result.success) {
            await this.integrity.halt(context, runId, token, checkpoint.workflowStepId, result.error,
              result.error === "APPROVAL_REQUIRED" ? result.approvalId : undefined);
            return { ...failure(result.error), ...(result.error === "APPROVAL_REQUIRED" ? { approvalId: result.approvalId } : {}),
              failedStep: definition.stepKey, failedCapabilityKey: definition.capabilityKey };
          }
          output = result.output;
          if (!this.validOutput(index, output, context.companyId, adapter.key)) {
            await this.integrity.halt(context, runId, token, checkpoint.workflowStepId, "EXECUTION_FAILED");
            return failure("EXECUTION_FAILED");
          }
          await this.integrity.checkpoint(context, runId, token, checkpoint.workflowStepId, output as Prisma.InputJsonValue);
        }
        if (!this.validOutput(index, output, context.companyId, checkpoint.adapterKey ?? (output as { sourceAdapter?: string })?.sourceAdapter)) {
          if (token) await this.integrity.halt(context, runId, token, null, "EXECUTION_FAILED");
          return failure("EXECUTION_FAILED");
        }
        outputs.push(output);
        completed.push({ ...definition, companyId: context.companyId, status: "COMPLETED", output });
      }
      const output = { contract: outputs[0], plan: outputs[1], capacity: outputs[2] };
      if (leaseLost) return failure("EXECUTION_INTERRUPTED");
      for (const request of requests) {
        if (!await this.authorization.canAccessCheckpoint(context, request)) {
          if (token) await this.integrity.halt(context, runId, token, null, "CHECKPOINT_ACCESS_DENIED");
          return failure("DENIED");
        }
      }
      if (token) await this.integrity.finish(context, runId, token, output as Prisma.InputJsonValue);
      return { success: true, companyId: context.companyId, workflowRunId: runId, workflowKey: PREPARE_OPERATION_WORKFLOW_KEY, steps: completed, output };
    } finally {
      if (timer) clearInterval(timer);
    }
  }

  private validOutput(index: number, output: unknown, companyId: string, adapterKey?: string): boolean {
    if (!output || typeof output !== "object" || Array.isArray(output)) return false;
    const record = output as Record<string, unknown>;
    if (record.companyId !== companyId || typeof record.simulated !== "boolean" || !adapterKey || record.sourceAdapter !== adapterKey) return false;
    const keys = index === 0 ? ["externalRef", "name", "clientName", "startDate", "status"]
      : index === 1 ? ["planId", "contractExternalRef", "targetStartDate"] : ["planId"];
    if (!keys.every((key) => typeof record[key] === "string")) return false;
    if (index === 1 && (!Array.isArray(record.workstreams) || !record.workstreams.every((value) => typeof value === "string"))) return false;
    if (index === 2 && (typeof record.available !== "boolean" || !Array.isArray(record.gaps) || !record.gaps.every((value) => typeof value === "string"))) return false;
    try { return Buffer.byteLength(JSON.stringify(output), "utf8") <= 65536; } catch { return false; }
  }
}
