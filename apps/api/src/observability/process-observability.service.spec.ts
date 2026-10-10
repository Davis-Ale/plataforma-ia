import { BadRequestException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { buildProcessObservation } from "./process-observation";
import { ProcessObservabilityService } from "./process-observability.service";
import { ProcessObservationInput } from "./process-observation.types";

describe("Process observability", () => {
  const input: ProcessObservationInput = {
    companyId: "company-a",
    correlationId: "execution-a",
    operation: "example.execute",
    capabilityKey: "example.read",
    startedAt: new Date("2026-10-07T10:00:00.000Z"),
    completedAt: new Date("2026-10-07T10:00:00.250Z"),
    result: "SUCCESS",
  };

  it("persists tenant, correlation, duration and explicit outcomes without arbitrary payloads", async () => {
    const create = jest.fn();
    const service = new ProcessObservabilityService({ create } as unknown as AuditService);
    await service.record({
      ...input,
      outcomes: { timeSavedMs: 1000, slaTargetMs: 500, slaMet: true, errorsAvoided: 1, manualVolumeReduced: 2 },
      ...{ secret: "must-not-be-recorded" },
    });
    expect(create).toHaveBeenCalledWith({
      companyId: "company-a", action: "CREATE", resource: "process_execution", resourceId: "execution-a",
      metadata: { observation: {
        version: 1, correlationId: "execution-a", operation: "example.execute", capabilityKey: "example.read",
        startedAt: input.startedAt.toISOString(), completedAt: input.completedAt.toISOString(),
        durationMs: 250, result: "SUCCESS", success: true,
        outcomes: { timeSavedMs: 1000, slaTargetMs: 500, slaMet: true, errorsAvoided: 1, manualVolumeReduced: 2 },
      } },
    });
  });

  it("generates independent correlations and does not invent outcomes", () => {
    const first = buildProcessObservation({ ...input, correlationId: undefined });
    const second = buildProcessObservation({ ...input, correlationId: undefined });
    expect(first.correlationId).not.toBe(second.correlationId);
    expect(first.outcomes).toEqual({});
  });

  it.each([
    { companyId: "" }, { correlationId: " " },
    { completedAt: new Date("2026-10-07T09:00:00Z") },
    { completedAt: new Date(NaN) },
    { outcomes: { timeSavedMs: -1 } }, { outcomes: { slaTargetMs: Infinity } },
    { outcomes: { errorsAvoided: 1.5 } }, { outcomes: { manualVolumeReduced: NaN } },
  ])("rejects invalid observations before persistence: %j", async (invalid) => {
    const create = jest.fn();
    const service = new ProcessObservabilityService({ create } as unknown as AuditService);
    await expect(service.record({ ...input, ...invalid })).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("records only controlled failure diagnostics", () => {
    expect(buildProcessObservation({ ...input, result: "FAILURE", errorCode: "EXECUTION_FAILED" }))
      .toEqual(expect.objectContaining({ success: false, errorCode: "EXECUTION_FAILED" }));
  });

  it("propagates audit persistence failures", async () => {
    const service = new ProcessObservabilityService({
      create: jest.fn().mockRejectedValue(new Error("audit unavailable")),
    } as unknown as AuditService);
    await expect(service.record(input)).rejects.toThrow("audit unavailable");
  });
});
