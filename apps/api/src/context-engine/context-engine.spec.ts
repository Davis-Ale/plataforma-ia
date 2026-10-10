import { PrismaService } from "@plataforma/database";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { CapabilityRegistry } from "../capabilities/capability-registry.service";
import { Capability, CapabilityContext } from "../capabilities/capability.types";
import { HumanApprovalService } from "../capabilities/human-approval.service";
import { ProcessObservabilityService } from "../observability/process-observability.service";

describe("Context Engine through Authorization Gateway", () => {
  const actor: CapabilityContext = { companyId: "a", userId: "u", sessionId: "s", correlationId: "trace" };
  const request = { capability: "example.read", input: { id: "record" } };
  let registry: CapabilityRegistry;
  let gateway: AuthorizationGateway;
  let membership: jest.Mock;
  let authorize: jest.Mock;
  let read: jest.Mock;
  let record: jest.Mock;
  let gate: jest.Mock;
  let execute: jest.Mock;
  let capability: Capability;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    membership = jest.fn().mockResolvedValue({ role: "MEMBER" });
    authorize = jest.fn().mockResolvedValue(true);
    read = jest.fn().mockImplementation(async (context) => ({ companyId: context.companyId, text: "minimal" }));
    record = jest.fn().mockResolvedValue(undefined);
    gate = jest.fn().mockResolvedValue(undefined);
    execute = jest.fn();
    capability = { key: request.capability, allowedRoles: ["MEMBER"], approval: { mode: "NONE" },
      validate: (input): input is unknown => input !== null,
      authorize: () => true, execute,
      context: { maxBytes: 512, fields: [{ key: "status", authorize, read }] } };
    gateway = new AuthorizationGateway(registry,
      { companyUser: { findFirst: membership } } as unknown as PrismaService,
      { gate } as unknown as HumanApprovalService,
      { record } as unknown as ProcessObservabilityService);
  });

  it("exposes only explicitly selected content and never executes the capability", async () => {
    read.mockResolvedValue({ companyId: "a", text: "minimal", secret: "hidden", history: ["hidden"] });
    registry.register(capability);
    const result = await gateway.prepareContext(actor, request);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected context");
    expect(JSON.parse(result.output.content)).toEqual([{ key: "status", text: "minimal", representation: "FULL" }]);
    expect(result.output.sizeBytes).toBe(Buffer.byteLength(result.output.content));
    expect(result.output.companyId).toBe("a");
    expect(execute).not.toHaveBeenCalled();
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]);
    expect(JSON.stringify(record.mock.calls)).not.toMatch(/minimal|hidden/);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: "context.prepare", companyId: "a", correlationId: "trace" }));
  });

  it.each(["companyId", "userId", "sessionId"])("denies missing %s", async (key) => {
    registry.register(capability);
    expect(await gateway.prepareContext({ ...actor, [key]: "" }, request)).toEqual({ success: false, error: "DENIED" });
    expect(read).not.toHaveBeenCalled();
  });

  it("denies unregistered or unconfigured capabilities", async () => {
    expect((await gateway.prepareContext(actor, request)).success).toBe(false);
    registry.register({ ...capability, context: undefined });
    expect((await gateway.prepareContext(actor, request)).success).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([null, { role: "ADMIN" }])("denies inactive membership or wrong role: %s", async (value) => {
    registry.register(capability);
    membership.mockResolvedValue(value);
    expect((await gateway.prepareContext(actor, request)).success).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("denies capability authorization before field reads", async () => {
    registry.register({ ...capability, authorize: () => false });
    expect((await gateway.prepareContext(actor, request)).success).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("preserves approval gating", async () => {
    registry.register(capability);
    gate.mockResolvedValue({ success: false, error: "APPROVAL_REQUIRED", approvalId: "approval" });
    expect(await gateway.prepareContext(actor, request)).toEqual({ success: false, error: "APPROVAL_REQUIRED", approvalId: "approval" });
    expect(read).not.toHaveBeenCalled();
  });

  it("omits denied fields without loading them", async () => {
    registry.register(capability);
    authorize.mockResolvedValue(false);
    expect(await gateway.prepareContext(actor, request)).toMatchObject({ success: true, output: { content: "[]" } });
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant source and returns no partial data", async () => {
    registry.register(capability);
    read.mockResolvedValue({ companyId: "b", text: "secret" });
    expect(await gateway.prepareContext(actor, request)).toEqual({ success: false, error: "EXECUTION_FAILED" });
  });

  it("isolates concurrent requests and revalidates each membership", async () => {
    registry.register(capability);
    const results = await Promise.all([actor, { ...actor, companyId: "b" }].map((context) => gateway.prepareContext(context, request)));
    expect(results).toMatchObject([{ success: true, output: { companyId: "a" } }, { success: true, output: { companyId: "b" } }]);
    expect(membership.mock.calls.map(([query]) => query.where.companyId)).toEqual(["a", "b"]);
  });

  it("uses an authorized summary when full content exceeds budget", async () => {
    registry.register(capability);
    read.mockResolvedValue({ companyId: "a", text: "x".repeat(1000), summary: "short" });
    const result = await gateway.prepareContext(actor, { ...request, maxBytes: 100 });
    expect(result).toMatchObject({ success: true, output: { reduced: true } });
    if (result.success) expect(JSON.parse(result.output.content)[0]).toMatchObject({ text: "short", representation: "SUMMARY" });
  });

  it.each([2, 70, 100, 10000])("caps serialized UTF-8 content at %s bytes or the policy limit", async (maxBytes) => {
    registry.register(capability);
    read.mockResolvedValue({ companyId: "a", text: '😀\n"'.repeat(500) });
    const result = await gateway.prepareContext(actor, { ...request, maxBytes });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.sizeBytes).toBeLessThanOrEqual(Math.min(maxBytes, 512));
      expect(() => JSON.parse(result.output.content)).not.toThrow();
      expect(result.output.reduced).toBe(true);
    }
  });

  it.each([0, -1, NaN, Infinity, 1.5])("rejects invalid request limit %s before reads", async (maxBytes) => {
    registry.register(capability);
    expect(await gateway.prepareContext(actor, { ...request, maxBytes })).toEqual({ success: false, error: "INVALID_INPUT" });
    expect(read).not.toHaveBeenCalled();
  });

  it("fails closed on source, field authorization, or observability failure", async () => {
    registry.register(capability);
    authorize.mockRejectedValueOnce(new Error("secret"));
    expect((await gateway.prepareContext(actor, request)).success).toBe(false);
    read.mockRejectedValueOnce(new Error("secret"));
    expect((await gateway.prepareContext(actor, request)).success).toBe(false);
    record.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(gateway.prepareContext(actor, request)).rejects.toThrow("audit unavailable");
  });

  it("snapshots policy registration and rejects unsafe limits", async () => {
    registry.register(capability);
    expect(Object.isFrozen(registry.resolve(request.capability)?.context?.fields)).toBe(true);
    expect(() => new CapabilityRegistry().register({ ...capability, context: { maxBytes: 20000, fields: [] } })).toThrow();
  });
});
