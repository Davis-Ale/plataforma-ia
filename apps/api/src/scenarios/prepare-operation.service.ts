import { Injectable } from "@nestjs/common";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { CapabilityContext } from "../capabilities/capability.types";
import { CONTRACTS_READ_KEY } from "../integrations/contracts-read.capability";
import { OPERATIONS_PLAN_KEY } from "../integrations/operations-plan.capability";
import { PEOPLE_CAPACITY_CHECK_KEY } from "../integrations/people-capacity.capability";
import { WorkflowsService } from "../workflows/workflows.service";

export const PREPARE_OPERATION_WORKFLOW_KEY = "operations.prepare_from_contract";

export type PrepareOperationInput = Readonly<{
  contractExternalRef: string;
}>;

export type PrepareOperationResult =
  | Readonly<{
      success: true;
      companyId: string;
      workflowRunId: string;
      workflowKey: string;
      steps: readonly Readonly<{
        stepKey: string;
        capabilityKey: string;
        integrationKind: "contracts" | "operations" | "people";
        companyId: string;
        status: "COMPLETED";
        output: unknown;
      }>[];
      output: Readonly<{
        contract: unknown;
        plan: unknown;
        capacity: unknown;
      }>;
    }>
  | Readonly<{
      success: false;
      companyId: string;
      workflowRunId?: string;
      error: "DENIED" | "INVALID_INPUT" | "EXECUTION_FAILED" | "APPROVAL_REQUIRED";
      approvalId?: string;
      failedStep?: string;
      failedCapabilityKey?: string;
    }>;

@Injectable()
export class PrepareOperationService {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly authorization: AuthorizationGateway,
  ) {}

  async run(context: CapabilityContext, input: PrepareOperationInput): Promise<PrepareOperationResult> {
    if (
      !context ||
      typeof context.companyId !== "string" ||
      context.companyId.trim() === "" ||
      typeof context.userId !== "string" ||
      typeof context.sessionId !== "string"
    ) {
      return { success: false, companyId: context?.companyId ?? "", error: "DENIED" };
    }
    if (
      !input ||
      typeof input.contractExternalRef !== "string" ||
      input.contractExternalRef.trim() === ""
    ) {
      return { success: false, companyId: context.companyId, error: "INVALID_INPUT" };
    }

    const companyId = context.companyId;
    const contractRef = input.contractExternalRef.trim();

    const contractResult = await this.authorization.execute(context, {
      capability: CONTRACTS_READ_KEY,
      input: { externalRef: contractRef },
    });

    if (!contractResult.success) {
      if (contractResult.error === "APPROVAL_REQUIRED") {
        return {
          success: false,
          companyId,
          error: "APPROVAL_REQUIRED",
          approvalId: contractResult.approvalId,
          failedStep: "read_contract",
          failedCapabilityKey: CONTRACTS_READ_KEY,
        };
      }
      return {
        success: false,
        companyId,
        error: contractResult.error,
        failedStep: "read_contract",
        failedCapabilityKey: CONTRACTS_READ_KEY,
      };
    }

    const contractOutput = contractResult.output;

    const run = await this.workflows.createRun(companyId, PREPARE_OPERATION_WORKFLOW_KEY, {
      contractExternalRef: contractRef,
      scenario: "new_contract",
      areas: ["contracts", "operations", "people"],
    });

    const stepDefs = [
      {
        stepKey: "read_contract",
        capabilityKey: CONTRACTS_READ_KEY,
        integrationKind: "contracts" as const,
        order: 1,
      },
      {
        stepKey: "plan_operations",
        capabilityKey: OPERATIONS_PLAN_KEY,
        integrationKind: "operations" as const,
        order: 2,
      },
      {
        stepKey: "check_capacity",
        capabilityKey: PEOPLE_CAPACITY_CHECK_KEY,
        integrationKind: "people" as const,
        order: 3,
      },
    ] as const;

    const createdSteps = [];
    for (const def of stepDefs) {
      createdSteps.push(
        await this.workflows.createStep(companyId, run.id, {
          stepKey: def.stepKey,
          stepOrder: def.order,
          input: {
            companyId,
            capabilityKey: def.capabilityKey,
            integrationKind: def.integrationKind,
          },
        }),
      );
    }

    await this.workflows.startRun(companyId, run.id);

    const completed: Array<{
      stepKey: string;
      capabilityKey: string;
      integrationKind: "contracts" | "operations" | "people";
      companyId: string;
      status: "COMPLETED";
      output: unknown;
    }> = [];

    await this.workflows.startStep(companyId, run.id, createdSteps[0].id);
    await this.workflows.completeStep(companyId, run.id, createdSteps[0].id, contractOutput as never);
    completed.push({
      stepKey: stepDefs[0].stepKey,
      capabilityKey: stepDefs[0].capabilityKey,
      integrationKind: stepDefs[0].integrationKind,
      companyId,
      status: "COMPLETED",
      output: contractOutput,
    });

    let planOutput: unknown;
    let capacityOutput: unknown;

    for (let index = 1; index < stepDefs.length; index++) {
      const def = stepDefs[index];
      const step = createdSteps[index];
      await this.workflows.startStep(companyId, run.id, step.id);

      let capabilityInput: unknown;
      if (def.capabilityKey === OPERATIONS_PLAN_KEY) {
        const contract = contractOutput as {
          externalRef: string;
          name: string;
          clientName: string;
          startDate: string;
        };
        capabilityInput = {
          contractExternalRef: contract.externalRef,
          contractName: contract.name,
          clientName: contract.clientName,
          startDate: contract.startDate,
        };
      } else {
        const plan = planOutput as {
          planId: string;
          workstreams: string[];
          targetStartDate: string;
        };
        capabilityInput = {
          planId: plan.planId,
          workstreams: plan.workstreams,
          targetStartDate: plan.targetStartDate,
        };
      }

      const result = await this.authorization.execute(context, {
        capability: def.capabilityKey,
        input: capabilityInput,
      });

      if (!result.success) {
        await this.workflows.failStep(companyId, run.id, step.id, result.error);
        await this.workflows.failRun(companyId, run.id, result.error);
        if (result.error === "APPROVAL_REQUIRED") {
          return {
            success: false,
            companyId,
            workflowRunId: run.id,
            error: "APPROVAL_REQUIRED",
            approvalId: result.approvalId,
            failedStep: def.stepKey,
            failedCapabilityKey: def.capabilityKey,
          };
        }
        return {
          success: false,
          companyId,
          workflowRunId: run.id,
          error: result.error,
          failedStep: def.stepKey,
          failedCapabilityKey: def.capabilityKey,
        };
      }

      await this.workflows.completeStep(companyId, run.id, step.id, result.output as never);
      completed.push({
        stepKey: def.stepKey,
        capabilityKey: def.capabilityKey,
        integrationKind: def.integrationKind,
        companyId,
        status: "COMPLETED",
        output: result.output,
      });

      if (def.capabilityKey === OPERATIONS_PLAN_KEY) planOutput = result.output;
      if (def.capabilityKey === PEOPLE_CAPACITY_CHECK_KEY) capacityOutput = result.output;
    }

    const output = Object.freeze({
      contract: contractOutput,
      plan: planOutput,
      capacity: capacityOutput,
    });
    await this.workflows.completeRun(companyId, run.id, output as never);

    return {
      success: true,
      companyId,
      workflowRunId: run.id,
      workflowKey: PREPARE_OPERATION_WORKFLOW_KEY,
      steps: Object.freeze(completed),
      output,
    };
  }
}
