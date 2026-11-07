import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { IntegrationResolver } from "../integrations/integration-resolver.service";
import { ExecutionIntegrityService } from "./execution-integrity.service";
import { PrepareOperationService } from "./prepare-operation.service";

describe("PrepareOperationService recovery", () => {
  const context = { companyId: "company-a", userId: "user-a", sessionId: "session-a" };
  const contract = { companyId: context.companyId, externalRef: "ATLAS", name: "Atlas", clientName: "Client", startDate: "2026-11-05", status: "ACTIVE", simulated: true, sourceAdapter: "contracts" };
  const operation = { companyId: context.companyId, planId: "plan", contractExternalRef: "ATLAS", workstreams: ["Delivery"], targetStartDate: "2026-11-05", simulated: true, sourceAdapter: "operations" };
  const capacity = { companyId: context.companyId, planId: "plan", available: true, gaps: [], simulated: true, sourceAdapter: "people" };
  const definitions = [["read_contract", "contracts.read", "contracts"], ["plan_operations", "operations.plan", "operations"], ["check_capacity", "people.capacity.check", "people"]];

  function setup(completed = 0) {
    const execution = { state: "RUNNING", leaseMs: 60000, run: { workflowKey: "operations.prepare_from_contract", input: { contractExternalRef: "ATLAS" } },
      checkpoints: definitions.map(([stepKey, capabilityKey, integrationKind], index) => ({ workflowStepId: String(index), capabilityKey, integrationKind,
        state: index < completed ? "COMPLETED" : "READY", adapterKey: index < completed ? integrationKind : null,
        step: { stepKey, output: [contract, operation, capacity][index] as unknown } })) };
    const integrity = { open: jest.fn().mockResolvedValue({ id: "run" }), claim: jest.fn().mockResolvedValue({ execution, token: "lease" }),
      dispatch: jest.fn(), checkpoint: jest.fn(), halt: jest.fn(), finish: jest.fn(), heartbeat: jest.fn() };
    const authorization = { canAccessCheckpoint: jest.fn().mockResolvedValue(true), execute: jest.fn().mockImplementation(async (_ctx, request) => ({ success: true,
      output: request.capability === "contracts.read" ? contract : request.capability === "operations.plan" ? operation : capacity })) };
    const integrations = { resolveContracts: jest.fn().mockResolvedValue({ key: "contracts", kind: "contracts", replaySafety: "READ_ONLY" }),
      resolveOperations: jest.fn().mockResolvedValue({ key: "operations", kind: "operations", replaySafety: "PURE" }),
      resolvePeople: jest.fn().mockResolvedValue({ key: "people", kind: "people", replaySafety: "READ_ONLY" }),
      withAdapter: jest.fn().mockImplementation((_company, _adapter, action) => action()) };
    return { execution, integrity, authorization, integrations,
      service: new PrepareOperationService(integrity as unknown as ExecutionIntegrityService, authorization as unknown as AuthorizationGateway, integrations as unknown as IntegrationResolver) };
  }

  it("persists identity before the first dispatch and rejects empty operation identity", async () => {
    const { service, integrity, authorization } = setup();
    expect(await service.run(context, { contractExternalRef: "ATLAS", operationId: "" })).toMatchObject({ error: "INVALID_INPUT" });
    expect(integrity.open).not.toHaveBeenCalled();
    expect((await service.run(context, { contractExternalRef: "ATLAS", operationId: "op" })).success).toBe(true);
    expect(integrity.open.mock.invocationCallOrder[0]).toBeLessThan(authorization.execute.mock.invocationCallOrder[0]);
    expect(integrity.finish).toHaveBeenCalledTimes(1);
  });

  it("reauthorizes a completed checkpoint without repeating its adapter call", async () => {
    const { service, authorization, integrity } = setup(1);
    expect((await service.resume(context, "run")).success).toBe(true);
    expect(authorization.canAccessCheckpoint).toHaveBeenCalledWith(context, { capability: "contracts.read", input: { externalRef: "ATLAS" } });
    expect(authorization.execute).toHaveBeenCalledTimes(2);
    expect(integrity.checkpoint).toHaveBeenCalledTimes(2);
  });

  it("blocks reuse after a domain authorization is revoked", async () => {
    const { service, authorization, integrity } = setup(1);
    authorization.canAccessCheckpoint.mockResolvedValue(false);
    expect(await service.resume(context, "run")).toMatchObject({ success: false, error: "DENIED" });
    expect(authorization.execute).not.toHaveBeenCalled();
    expect(integrity.halt).toHaveBeenCalledWith(context, "run", "lease", null, "CHECKPOINT_ACCESS_DENIED");
  });

  it("records an uncertain failure and never completes unfinished work", async () => {
    const { service, authorization, integrity } = setup(1);
    authorization.execute.mockRejectedValue(new Error("connection interrupted"));
    expect(await service.resume(context, "run")).toMatchObject({ success: false, error: "EXECUTION_FAILED" });
    expect(integrity.halt).toHaveBeenCalledWith(context, "run", "lease", "1", "EXECUTION_FAILED", undefined);
    expect(integrity.finish).not.toHaveBeenCalled();
  });

  it("rejects changed bindings before dispatch", async () => {
    const { service, execution, integrity } = setup();
    execution.checkpoints[0].adapterKey = "previous";
    expect(await service.resume(context, "run")).toMatchObject({ error: "INTEGRATION_UNAVAILABLE" });
    expect(integrity.dispatch).not.toHaveBeenCalled();
  });

  it("does not release checkpoints containing another company", async () => {
    const { service, execution, integrity } = setup(1);
    execution.checkpoints[0].step.output = { ...contract, companyId: "foreign" };
    expect(await service.resume(context, "run")).toMatchObject({ success: false, error: "EXECUTION_FAILED" });
    expect(integrity.finish).not.toHaveBeenCalled();
  });
});
