import { ConflictException } from "@nestjs/common";
import { WorkflowStatus } from "@prisma/client";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { WorkflowsService } from "../workflows/workflows.service";
import {
  PREPARE_OPERATION_WORKFLOW_KEY,
  PrepareOperationService,
} from "./prepare-operation.service";

describe("PrepareOperationService identity", () => {
  const companyId = "company-a";
  const context = {
    companyId,
    userId: "user-a",
    sessionId: "session-a",
    correlationId: "corr-prepare",
  };
  const input = {
    contractExternalRef: "ATLAS",
    operationId: "op-atlas",
  };
  const workflowInput = {
    contractExternalRef: "ATLAS",
    scenario: "new_contract",
    areas: ["contracts", "operations", "people"],
  };

  function buildService(overrides?: {
    createRun?: jest.Mock;
    execute?: jest.Mock;
  }) {
    const createRun = overrides?.createRun ?? jest.fn();
    const createStep = jest.fn();
    const startRun = jest.fn();
    const workflows = {
      createRun,
      createStep,
      startRun,
      startStep: jest.fn(),
      completeStep: jest.fn(),
      failStep: jest.fn(),
      completeRun: jest.fn(),
      failRun: jest.fn(),
    } as unknown as WorkflowsService;
    const authorization = {
      execute:
        overrides?.execute ??
        jest.fn().mockResolvedValue({
          success: true,
          output: { externalRef: "ATLAS" },
        }),
    } as unknown as AuthorizationGateway;
    return {
      service: new PrepareOperationService(workflows, authorization),
      createRun,
      createStep,
      startRun,
    };
  }

  it("rejects a missing operationId before creating a run", async () => {
    const { service, createRun } = buildService();
    const result = await service.run(context, {
      contractExternalRef: "ATLAS",
      operationId: "",
    });
    expect(result).toEqual({
      success: false,
      companyId,
      error: "INVALID_INPUT",
    });
    expect(createRun).not.toHaveBeenCalled();
  });

  it("creates the workflow run with caller operationId and persisted correlationId", async () => {
    const createRun = jest.fn().mockResolvedValue({
      created: true,
      run: {
        id: "run-new",
        companyId,
        status: WorkflowStatus.PENDING,
        correlationId: "corr-prepare",
      },
    });
    const { service, createStep } = buildService({ createRun });
    createStep.mockRejectedValue(new Error("stop-after-create"));

    await expect(service.run(context, input)).rejects.toThrow(
      "stop-after-create",
    );
    expect(createRun).toHaveBeenCalledWith(
      companyId,
      PREPARE_OPERATION_WORKFLOW_KEY,
      workflowInput,
      {
        operationId: "op-atlas",
        correlationId: "corr-prepare",
      },
    );
  });

  it("returns the existing completed run without re-executing steps", async () => {
    const existing = {
      id: "run-existing",
      companyId,
      status: WorkflowStatus.COMPLETED,
      output: {
        contract: { externalRef: "ATLAS" },
        plan: { planId: "plan-a" },
        capacity: { available: true },
      },
    };
    const { service, createRun, createStep, startRun } = buildService({
      createRun: jest.fn().mockResolvedValue({
        created: false,
        run: existing,
      }),
    });

    const result = await service.run(context, input);

    expect(result).toEqual({
      success: true,
      companyId,
      workflowRunId: "run-existing",
      workflowKey: PREPARE_OPERATION_WORKFLOW_KEY,
      steps: [],
      output: existing.output,
    });
    expect(createRun).toHaveBeenCalledTimes(1);
    expect(createStep).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it.each([WorkflowStatus.PENDING, WorkflowStatus.RUNNING])(
    "fails closed for an existing %s run without treating it as complete",
    async (status) => {
      const { service, createRun, createStep, startRun } = buildService({
        createRun: jest.fn().mockResolvedValue({
          created: false,
          run: {
            id: "run-active",
            companyId,
            status,
            output: null,
          },
        }),
      });

      const result = await service.run(context, input);

      expect(result).toEqual({
        success: false,
        companyId,
        workflowRunId: "run-active",
        error: "EXECUTION_IN_PROGRESS",
      });
      expect(createRun).toHaveBeenCalledTimes(1);
      expect(createStep).not.toHaveBeenCalled();
      expect(startRun).not.toHaveBeenCalled();
    },
  );

  it("propagates a fail-closed operation conflict", async () => {
    const { service, createStep } = buildService({
      createRun: jest
        .fn()
        .mockRejectedValue(new ConflictException("Workflow operation conflict")),
    });

    await expect(service.run(context, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(createStep).not.toHaveBeenCalled();
  });
});
