import { PrismaService } from "@plataforma/database";
import { ProcessObservabilityService } from "../observability/process-observability.service";
import { AuthorizationGateway } from "./authorization-gateway.service";
import { CapabilityRegistry } from "./capability-registry.service";
import { ApprovalPurpose, CapabilityApprovalRequest } from "./capability.types";
import { HumanApprovalService } from "./human-approval.service";

describe("Approval purpose isolation", () => {
  const purposes: ApprovalPurpose[] = ["CONTEXT_PREPARATION", "GENERATION", "EXECUTION"];
  const actor = { companyId: "a", userId: "requester", sessionId: "session" };
  const approver = { ...actor, userId: "approver" };
  const request = { capability: "critical.update", input: { id: "record" } };
  let approval: HumanApprovalService;
  let gateway: AuthorizationGateway;
  let row: Record<string, unknown> | undefined;
  let execute: jest.Mock;
  let read: jest.Mock;
  let audit: jest.Mock;
  let create: jest.Mock;
  let findFirst: jest.Mock;
  let updateMany: jest.Mock;

  beforeEach(() => {
    row = undefined;
    execute = jest.fn().mockResolvedValue("executed");
    read = jest.fn().mockResolvedValue({ companyId: "a", text: "authorized" });
    audit = jest.fn().mockResolvedValue({});
    const registry = new CapabilityRegistry();
    registry.register({ key: request.capability, allowedRoles: ["MEMBER"],
      approval: { mode: "REQUIRED", approverRoles: ["ADMIN"] },
      validate: (input): input is unknown => input !== null, authorize: () => true, execute,
      context: { maxBytes: 512, fields: [{ key: "status", authorize: () => true, read }] } });
    const matches = (where: Record<string, unknown>) => row !== undefined && Object.entries(where)
      .every(([key, value]) => typeof value === "object" || row?.[key] === value);
    create = jest.fn().mockImplementation(async ({ data }) => {
      row = { id: "approval", status: "PENDING", ...data };
      return row;
    });
    findFirst = jest.fn().mockImplementation(async ({ where }) => matches(where) ? { ...row } : null);
    updateMany = jest.fn().mockImplementation(async ({ where, data }) => {
      if (!matches(where)) return { count: 0 };
      row = { ...row, ...data };
      return { count: 1 };
    });
    const tx = { capabilityApproval: { create, findFirst, updateMany }, auditLog: { create: audit } };
    const prisma = { companyUser: { findFirst: jest.fn().mockImplementation(async ({ where }) =>
      ({ role: where.userId === "approver" ? "ADMIN" : "MEMBER" })) },
      $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService;
    approval = new HumanApprovalService(prisma, registry);
    gateway = new AuthorizationGateway(registry, prisma, approval,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as ProcessObservabilityService);
  });

  function invoke(purpose: ApprovalPurpose, approvalId?: string) {
    const input = { ...request, approvalId };
    if (purpose === "EXECUTION") return gateway.execute(actor, input);
    if (purpose === "GENERATION") return gateway.prepareGenerationContext(actor, input);
    return gateway.prepareContext(actor, input);
  }

  it.each(purposes)("binds creation, decision and single consumption to %s", async (purpose) => {
    expect(await invoke(purpose)).toEqual({ success: false, error: "APPROVAL_REQUIRED", approvalId: "approval" });
    expect(row).toMatchObject({ purpose, companyId: "a", status: "PENDING" });
    expect(await approval.decide(approver, "approval", "APPROVED", purpose)).toEqual({ success: true, status: "APPROVED" });
    expect((await invoke(purpose, "approval")).success).toBe(true);
    expect(row).toMatchObject({ purpose, status: "CONSUMED" });
    expect(await invoke(purpose, "approval")).toEqual({ success: false, error: "DENIED" });
    expect(audit.mock.calls.every(([input]) => input.data.metadata.purpose === purpose)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(purpose === "EXECUTION" ? 1 : 0);
    expect(read).toHaveBeenCalledTimes(purpose === "EXECUTION" ? 0 : 1);
  });

  it.each(purposes.flatMap((from) => purposes.filter((to) => to !== from).map((to) => [from, to])))
    ("rejects decision and consumption from %s as %s", async (from, to) => {
      await invoke(from);
      expect(await approval.decide(approver, "approval", "APPROVED", to)).toEqual({ success: false, error: "DENIED" });
      expect(row?.status).toBe("PENDING");
      await approval.decide(approver, "approval", "APPROVED", from);
      expect(await invoke(to, "approval")).toEqual({ success: false, error: "DENIED" });
      expect(row?.status).toBe("APPROVED");
      expect(execute).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    });

  it("rejects missing/invalid purposes and legacy records without inferring authority", async () => {
    expect(await approval.gate(actor, request as CapabilityApprovalRequest)).toEqual({ success: false, error: "DENIED" });
    expect(create).not.toHaveBeenCalled();
    await invoke("EXECUTION");
    row!.purpose = null;
    expect(await approval.decide(approver, "approval", "APPROVED", "EXECUTION")).toEqual({ success: false, error: "DENIED" });
    row!.status = "APPROVED";
    row!.decision = "APPROVED";
    for (const purpose of purposes) expect(await invoke(purpose, "approval")).toEqual({ success: false, error: "DENIED" });
    expect(await approval.decide(approver, "approval", "APPROVED", "INVALID" as ApprovalPurpose)).toEqual({ success: false, error: "DENIED" });
  });

  it("derives purpose from the backend entry point rather than request input", async () => {
    await gateway.execute(actor, { ...request, purpose: "GENERATION" } as typeof request);
    expect(row?.purpose).toBe("EXECUTION");
    expect(await approval.decide({ ...approver, companyId: "b" }, "approval", "APPROVED", "EXECUTION"))
      .toEqual({ success: false, error: "DENIED" });
  });
});
