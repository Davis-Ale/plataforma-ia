import { CompanyUserRole } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuthorizationGateway } from "./authorization-gateway.service";
import { CapabilityRegistry } from "./capability-registry.service";
import { Capability, CapabilityContext } from "./capability.types";
import { HumanApprovalService } from "./human-approval.service";
import { createHash } from "node:crypto";
import { serialize } from "node:v8";

describe("Capability Registry + Authorization Gateway", () => {
  const context: CapabilityContext = {
    companyId: "company-a",
    userId: "user-a",
    sessionId: "session-a",
  };
  const request = { capability: "example.read", input: { id: "resource-a" } };
  let registry: CapabilityRegistry;
  let gateway: AuthorizationGateway;
  let findFirst: jest.Mock;
  let authorize: jest.Mock;
  let execute: jest.Mock;
  let capability: Capability<{ id: string }, { id: string }>;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    findFirst = jest.fn().mockResolvedValue({ role: CompanyUserRole.MEMBER });
    authorize = jest.fn().mockResolvedValue(true);
    execute = jest.fn().mockResolvedValue({ id: "resource-a" });
    capability = {
      key: request.capability,
      allowedRoles: ["MEMBER"],
      approval: { mode: "NONE" },
      validate: (input): input is { id: string } =>
        typeof input === "object" && input !== null &&
        "id" in input && typeof input.id === "string",
      authorize,
      execute,
    };
    const prisma = {
      companyUser: { findFirst },
    } as unknown as PrismaService;
    gateway = new AuthorizationGateway(registry, prisma, new HumanApprovalService(prisma, registry));
  });

  it("starts empty and denies unknown capabilities without execution", async () => {
    expect(await gateway.execute(context, request)).toEqual({
      success: false, error: "DENIED",
    });
    expect(findFirst).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["companyId", "userId", "sessionId"] as const)(
    "denies missing %s before querying or executing",
    async (field) => {
      registry.register(capability);
      expect(await gateway.execute({ ...context, [field]: " " }, request))
        .toEqual({ success: false, error: "DENIED" });
      expect(findFirst).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("revalidates tenant, active user, company, membership and session before execution", async () => {
    registry.register(capability);
    expect(await gateway.execute(context, request)).toEqual({
      success: true, output: { id: "resource-a" },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        companyId: "company-a",
        userId: "user-a",
        status: "ACTIVE",
        company: { status: "ACTIVE" },
        user: {
          status: "ACTIVE",
          sessions: {
            some: {
              id: "session-a",
              userId: "user-a",
              revokedAt: null,
              expiresAt: { gt: expect.any(Date) },
            },
          },
        },
      },
      select: { role: true },
    });
    const trusted = { ...context, role: "MEMBER" };
    expect(authorize).toHaveBeenCalledWith(trusted, request.input);
    expect(execute).toHaveBeenCalledWith(trusted, request.input);
    expect(authorize.mock.invocationCallOrder[0])
      .toBeLessThan(execute.mock.invocationCallOrder[0]);
    expect(Object.isFrozen(execute.mock.calls[0][0])).toBe(true);
  });

  it("denies cross-tenant requests when backend membership is absent", async () => {
    registry.register(capability);
    findFirst.mockResolvedValue(null);
    expect(await gateway.execute({ ...context, companyId: "company-b" }, request))
      .toEqual({ success: false, error: "DENIED" });
    expect(findFirst.mock.calls[0][0].where.companyId).toBe("company-b");
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("denies when no roles are explicitly allowed", async () => {
    registry.register({ ...capability, allowedRoles: [] });
    expect(await gateway.execute(context, request))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("denies by default when no approval policy is explicitly configured", async () => {
    registry.register({ ...capability, approval: undefined });
    expect(await gateway.execute(context, request))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses the backend role rather than a supplied role", async () => {
    registry.register({ ...capability, allowedRoles: ["OWNER"] });
    const forged = { ...context, role: "OWNER" };
    expect(await gateway.execute(forged, request))
      .toEqual({ success: false, error: "DENIED" });
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([false, undefined, "true"])(
    "requires explicit backend authorization: %s",
    async (decision) => {
      registry.register(capability);
      authorize.mockResolvedValue(decision);
      expect(await gateway.execute(context, request))
        .toEqual({ success: false, error: "DENIED" });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each(["membership", "policy"])(
    "fails closed on %s errors without exposing details",
    async (source) => {
      registry.register(capability);
      const failure = new Error("private backend details");
      if (source === "membership") {
        findFirst.mockRejectedValue(failure);
      } else {
        authorize.mockRejectedValue(failure);
      }
      expect(await gateway.execute(context, request))
        .toEqual({ success: false, error: "DENIED" });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid input before domain authorization and execution", async () => {
    registry.register(capability);
    expect(await gateway.execute(context, { ...request, input: {} }))
      .toEqual({ success: false, error: "INVALID_INPUT" });
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("isolates request and context from caller mutation while authorizing", async () => {
    registry.register(capability);
    const mutableContext = { ...context };
    const mutableRequest = structuredClone(request);
    authorize.mockImplementation(async () => {
      mutableContext.companyId = "company-b";
      mutableRequest.input.id = "resource-b";
      return true;
    });
    await gateway.execute(mutableContext, mutableRequest);
    expect(execute).toHaveBeenCalledWith(
      { ...context, role: "MEMBER" }, { id: "resource-a" },
    );
  });

  it("protects the validated and approved input from retained references during the gate", async () => {
    const original = {
      id: "resource-a",
      details: { items: [{ id: "nested-a" }] },
    };
    const expectedHash = createHash("sha256")
      .update(serialize(structuredClone(structuredClone(original)))).digest("hex");
    let retained: typeof original | undefined;
    const validate = jest.fn(capability.validate);
    authorize.mockImplementation(async (_context: unknown, input: typeof original) => {
      retained = input;
      return true;
    });
    const updateMany = jest.fn(async ({ where }: { where: { inputHash: string } }) => {
      expect(retained).toBeDefined();
      expect(Reflect.set(retained!, "id", "resource-b")).toBe(false);
      expect(Reflect.set(retained!.details.items[0], "id", "nested-b")).toBe(false);
      expect(() => retained!.details.items.push({ id: "extra" })).toThrow();
      return { count: where.inputHash === expectedHash ? 1 : 0 };
    });
    const auditCreate = jest.fn().mockResolvedValue({});
    const tx = {
      capabilityApproval: {
        findFirst: jest.fn().mockResolvedValue({ status: "APPROVED" }),
        updateMany,
      },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      companyUser: { findFirst },
      $transaction: async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx),
    } as unknown as PrismaService;
    registry.register({
      ...capability,
      validate: (input): input is { id: string } => validate(input),
      approval: { mode: "REQUIRED", approverRoles: ["ADMIN"] },
    });
    const humanApproval = new HumanApprovalService(prisma, registry);
    const gate = jest.spyOn(humanApproval, "gate");
    const protectedGateway = new AuthorizationGateway(registry, prisma, humanApproval);
    expect(await protectedGateway.execute(context, {
      capability: request.capability,
      input: original,
      approvalId: "approval-a",
    })).toEqual({ success: true, output: { id: "resource-a" } });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    const snapshot = validate.mock.calls[0][0];
    expect(authorize.mock.calls[0][1]).toBe(snapshot);
    expect(gate.mock.calls[0][1].input).toBe(snapshot);
    expect(execute.mock.calls[0][1]).toBe(snapshot);
    expect(snapshot).toEqual(original);
    expect(snapshot).not.toBe(original);
    expect(Object.isFrozen(retained)).toBe(true);
    expect(Object.isFrozen(retained!.details)).toBe(true);
    expect(Object.isFrozen(retained!.details.items)).toBe(true);
    expect(Object.isFrozen(retained!.details.items[0])).toBe(true);
  });

  it.each([
    new Map([["id", "resource-a"]]),
    new Set(["resource-a"]),
    new Date(0),
    new Uint8Array([1]),
    new ArrayBuffer(1),
    new SharedArrayBuffer(1),
  ])("fails closed for input with mutable internal state: %p", async (mutable) => {
    registry.register(capability);
    expect(await gateway.execute(context, {
      ...request, input: { id: "resource-a", nested: mutable },
    })).toEqual({ success: false, error: "DENIED" });
    expect(findFirst).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a safe failure when the domain service fails", async () => {
    registry.register(capability);
    execute.mockRejectedValue(new Error("private backend details"));
    expect(await gateway.execute(context, request))
      .toEqual({ success: false, error: "EXECUTION_FAILED" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate registrations without replacing the original", () => {
    registry.register(capability);
    expect(() => registry.register({ ...capability, execute: jest.fn() }))
      .toThrow("Invalid or duplicate capability registration");
    expect(registry.resolve(capability.key)?.execute).toBeDefined();
  });

  it("rejects incomplete registration policies", () => {
    expect(() => registry.register({ ...capability, authorize: undefined } as unknown as Capability))
      .toThrow("Invalid or duplicate capability registration");
    expect(registry.resolve(capability.key)).toBeUndefined();
  });

  it("copies registration roles so they cannot be expanded later", async () => {
    const roles: Array<"OWNER" | "MEMBER"> = ["OWNER"];
    registry.register({ ...capability, allowedRoles: roles });
    roles.push("MEMBER");
    expect(await gateway.execute(context, request))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });
});
