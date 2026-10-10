import { ProcessObservabilityService } from "../observability/process-observability.service";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { CapabilityApprovalDecision, CompanyUserRole } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuthorizationGateway } from "./authorization-gateway.service";
import { CapabilityRegistry } from "./capability-registry.service";
import { Capability, CapabilityContext } from "./capability.types";
import { HumanApprovalService } from "./human-approval.service";

jest.setTimeout(20000);

const observability = { record: jest.fn().mockResolvedValue(undefined) } as unknown as ProcessObservabilityService;

describe("Human Approval PostgreSQL gate", () => {
  const prisma = new PrismaService();
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const requester: CapabilityContext = { companyId, userId: randomUUID(), sessionId: randomUUID() };
  const approver: CapabilityContext = { companyId, userId: randomUUID(), sessionId: randomUUID() };
  const request = { capability: "critical.update", input: { resourceId: "resource-a" } };
  const execute = jest.fn().mockResolvedValue({ updated: true });
  let registry: CapabilityRegistry;
  let approval: HumanApprovalService;
  let gateway: AuthorizationGateway;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      const env = readFileSync(resolve(__dirname, "../../../../.env"), "utf8");
      const value = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
      if (!value) throw new Error("DATABASE_URL is required");
      process.env.DATABASE_URL = value.replace(/^["']|["']$/g, "");
    }
    await prisma.$connect();
    await prisma.company.createMany({
      data: [
        { id: companyId, name: "approval-gate-test" },
        { id: otherCompanyId, name: "approval-other-tenant-test" },
      ],
    });
    for (const [actor, role] of [
      [requester, CompanyUserRole.MEMBER], [approver, CompanyUserRole.ADMIN],
    ] as const) {
      await prisma.user.create({
        data: {
          id: actor.userId,
          name: "approval-test-actor",
          email: `${actor.userId}@example.test`,
          companies: { create: [{ companyId, role }, { companyId: otherCompanyId, role }] },
          sessions: {
            create: {
              id: actor.sessionId,
              refreshTokenHash: randomUUID(),
              expiresAt: new Date(Date.now() + 600000),
            },
          },
        },
      });
    }
  });

  beforeEach(async () => {
    await prisma.companyUser.updateMany({
      where: { companyId, userId: requester.userId }, data: { role: "MEMBER", status: "ACTIVE" },
    });
    await prisma.companyUser.updateMany({
      where: { companyId, userId: approver.userId }, data: { role: "ADMIN", status: "ACTIVE" },
    });
    await prisma.authSession.updateMany({
      where: { id: approver.sessionId }, data: { revokedAt: null },
    });
    execute.mockClear();
    registry = new CapabilityRegistry();
    const capability: Capability<{ resourceId: string }, { updated: boolean }> = {
      key: request.capability,
      allowedRoles: ["MEMBER"],
      approval: { mode: "REQUIRED", approverRoles: ["ADMIN"] },
      validate: (input): input is { resourceId: string } =>
        typeof input === "object" && input !== null &&
        "resourceId" in input && typeof input.resourceId === "string",
      authorize: async () => true,
      execute,
    };
    registry.register(capability);
    approval = new HumanApprovalService(prisma, registry);
    gateway = new AuthorizationGateway(registry, prisma, approval, observability);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    try {
      await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [requester.userId, approver.userId] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function pending() {
    const result = await gateway.execute(requester, request);
    expect(result).toMatchObject({ success: false, error: "APPROVAL_REQUIRED" });
    if (result.success || result.error !== "APPROVAL_REQUIRED") {
      throw new Error("Approval request was not created");
    }
    return result.approvalId;
  }

  async function approved() {
    const approvalId = await pending();
    expect(await approval.decide(approver, approvalId, CapabilityApprovalDecision.APPROVED, "EXECUTION"))
      .toEqual({ success: true, status: "APPROVED" });
    return approvalId;
  }

  it("persists a pending escalation with audit and never executes before approval", async () => {
    const id = await pending();
    expect(await gateway.execute(requester, { ...request, approvalId: id }))
      .toEqual({ success: false, error: "APPROVAL_REQUIRED", approvalId: id });
    expect(execute).not.toHaveBeenCalled();
    expect(await prisma.capabilityApproval.findUnique({ where: { id } }))
      .toMatchObject({ companyId, requestedByUserId: requester.userId, status: "PENDING", decision: null });
    expect(await prisma.auditLog.count({ where: { companyId, resourceId: id, action: "CREATE" } })).toBe(1);
  });

  it("records approval and allows one execution while retaining the decision", async () => {
    const approvalId = await approved();
    expect(await gateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: true, output: { updated: true } });
    expect(await gateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await prisma.capabilityApproval.findUnique({ where: { id: approvalId } }))
      .toMatchObject({ status: "CONSUMED", decision: "APPROVED", decidedByUserId: approver.userId, decidedAt: expect.any(Date) });
    const audit = await prisma.auditLog.findMany({ where: { companyId, resourceId: approvalId }, orderBy: { createdAt: "asc" } });
    expect(audit.map((entry) => entry.metadata)).toEqual([
      { capability: request.capability, purpose: "EXECUTION", status: "PENDING" },
      { capability: request.capability, purpose: "EXECUTION", status: "APPROVED", decision: "APPROVED" },
      { capability: request.capability, purpose: "EXECUTION", status: "CONSUMED" },
    ]);
  });

  it("records rejection and prevents execution or later decision changes", async () => {
    const approvalId = await pending();
    expect(await approval.decide(approver, approvalId, CapabilityApprovalDecision.REJECTED, "EXECUTION"))
      .toEqual({ success: true, status: "REJECTED" });
    expect(await gateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    expect(await approval.decide(approver, approvalId, CapabilityApprovalDecision.APPROVED, "EXECUTION"))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects self-approval, wrong roles, missing tenant, other tenants and revoked sessions", async () => {
    const approvalId = await pending();
    for (const actor of [
      requester, { ...approver, companyId: "" }, { ...approver, companyId: otherCompanyId },
    ]) {
      expect(await approval.decide(actor, approvalId, CapabilityApprovalDecision.APPROVED, "EXECUTION"))
        .toEqual({ success: false, error: "DENIED" });
    }
    await prisma.companyUser.updateMany({ where: { companyId, userId: approver.userId }, data: { role: "MEMBER" } });
    expect(await approval.decide(approver, approvalId, CapabilityApprovalDecision.APPROVED, "EXECUTION"))
      .toEqual({ success: false, error: "DENIED" });
    await prisma.authSession.updateMany({ where: { id: approver.sessionId }, data: { revokedAt: new Date() } });
    expect(await approval.decide(approver, approvalId, CapabilityApprovalDecision.REJECTED, "EXECUTION"))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("denies self-approval even when the requester's role may approve", async () => {
    const approvalId = await pending();
    const selfRegistry = new CapabilityRegistry();
    selfRegistry.register({
      ...registry.resolve(request.capability)!,
      approval: { mode: "REQUIRED", approverRoles: ["MEMBER", "ADMIN"] },
    });
    const selfService = new HumanApprovalService(prisma, selfRegistry);
    expect(await selfService.decide(requester, approvalId, CapabilityApprovalDecision.APPROVED, "EXECUTION"))
      .toEqual({ success: false, error: "DENIED" });
  });

  it("binds approval to requester, tenant, capability and input", async () => {
    const approvalId = await approved();
    registry.register({ ...registry.resolve(request.capability)!, key: "other.update" });
    for (const changed of [
      { ...request, input: { resourceId: "resource-b" }, approvalId },
      { ...request, capability: "other.update", approvalId },
      { ...request, approvalId: randomUUID() },
    ]) {
      expect(await gateway.execute(requester, changed)).toEqual({ success: false, error: "DENIED" });
    }
    expect(await gateway.execute({ ...requester, companyId: otherCompanyId }, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    await prisma.companyUser.updateMany({ where: { companyId, userId: approver.userId }, data: { role: "MEMBER" } });
    expect(await gateway.execute(approver, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not bypass requester RBAC or current domain authorization", async () => {
    const approvalId = await approved();
    await prisma.companyUser.updateMany({ where: { companyId, userId: requester.userId }, data: { status: "INACTIVE" } });
    expect(await gateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    await prisma.companyUser.updateMany({ where: { companyId, userId: requester.userId }, data: { status: "ACTIVE" } });
    const deniedRegistry = new CapabilityRegistry();
    deniedRegistry.register({ ...registry.resolve(request.capability)!, authorize: async () => false });
    const deniedGateway = new AuthorizationGateway(deniedRegistry, prisma, new HumanApprovalService(prisma, deniedRegistry), observability);
    expect(await deniedGateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).not.toHaveBeenCalled();
    expect(await prisma.capabilityApproval.findUnique({ where: { id: approvalId } })).toMatchObject({ status: "APPROVED" });
  });

  it("revalidates the approver's current permissions before consumption", async () => {
    const approvalId = await approved();
    await prisma.companyUser.updateMany({ where: { companyId, userId: approver.userId }, data: { role: "MEMBER" } });
    expect(await gateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows only one of two concurrent executions and records one consumption", async () => {
    const approvalId = await approved();
    const results = await Promise.all([
      gateway.execute(requester, { ...request, approvalId }),
      gateway.execute(requester, { ...request, approvalId }),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await prisma.auditLog.count({ where: { companyId, resourceId: approvalId, metadata: { path: ["status"], equals: "CONSUMED" } } })).toBe(1);
  });

  it("allows only one concurrent approve/reject decision", async () => {
    const approvalId = await pending();
    const results = await Promise.all([
      approval.decide(approver, approvalId, CapabilityApprovalDecision.APPROVED, "EXECUTION"),
      approval.decide(approver, approvalId, CapabilityApprovalDecision.REJECTED, "EXECUTION"),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { companyId, resourceId: approvalId, action: "UPDATE" } })).toBe(1);
  });

  it("fails closed and rolls back approval creation when audit fails", async () => {
    const count = await prisma.capabilityApproval.count({ where: { companyId } });
    jest.spyOn(prisma, "$transaction").mockImplementationOnce(async (operation) => {
      if (typeof operation !== "function") throw new Error("Expected transaction callback");
      return prisma.$transaction(async (tx) => {
        jest.spyOn(tx.auditLog, "create").mockRejectedValueOnce(new Error("Audit unavailable"));
        return operation(tx);
      });
    });
    expect(await gateway.execute(requester, request)).toEqual({ success: false, error: "DENIED" });
    expect(await prisma.capabilityApproval.count({ where: { companyId } })).toBe(count);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rolls back the human decision when audit fails", async () => {
    const approvalId = await pending();
    jest.spyOn(prisma, "$transaction").mockImplementationOnce(async (operation) => {
      if (typeof operation !== "function") throw new Error("Expected transaction callback");
      return prisma.$transaction(async (tx) => {
        jest.spyOn(tx.auditLog, "create").mockRejectedValueOnce(new Error("Audit unavailable"));
        return operation(tx);
      });
    });
    expect(await approval.decide(approver, approvalId, CapabilityApprovalDecision.APPROVED, "EXECUTION"))
      .toEqual({ success: false, error: "DENIED" });
    expect(await prisma.capabilityApproval.findUnique({ where: { id: approvalId } }))
      .toMatchObject({ status: "PENDING", decision: null, decidedByUserId: null });
  });

  it("rolls back consumption and prevents execution when audit fails", async () => {
    const approvalId = await approved();
    jest.spyOn(prisma, "$transaction").mockImplementationOnce(async (operation) => {
      if (typeof operation !== "function") throw new Error("Expected transaction callback");
      return prisma.$transaction(async (tx) => {
        jest.spyOn(tx.auditLog, "create").mockRejectedValueOnce(new Error("Audit unavailable"));
        return operation(tx);
      });
    });
    expect(await gateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    expect(await prisma.capabilityApproval.findUnique({ where: { id: approvalId } }))
      .toMatchObject({ status: "APPROVED", consumedAt: null });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not reuse approval after a failed execution", async () => {
    const approvalId = await approved();
    execute.mockRejectedValueOnce(new Error("Domain execution failed"));
    expect(await gateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: false, error: "EXECUTION_FAILED" });
    expect(await gateway.execute(requester, { ...request, approvalId }))
      .toEqual({ success: false, error: "DENIED" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
