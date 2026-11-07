import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { GenerationService } from "../provider-gateway/generation.service";
import { WorkflowQuestionController } from "./workflow-question.controller";
import { WorkflowsService } from "./workflows.service";

describe("WorkflowQuestionController", () => {
  const company = { companyId: "company-a", membershipId: "membership-a", companyName: "Company",
    role: "MEMBER", companyStatus: "ACTIVE", membershipStatus: "ACTIVE" } as const;
  const user = { id: "user-a", email: "member@example.com", name: "Member", status: "ACTIVE" as const, companies: [] };
  const updatedAt = new Date("2026-01-01T12:00:00Z");
  const findOne = jest.fn();
  const canAccessCheckpoint = jest.fn();
  const generate = jest.fn();
  const controller = new WorkflowQuestionController({ findOne } as unknown as WorkflowsService,
    { canAccessCheckpoint } as unknown as AuthorizationGateway, { generate } as unknown as GenerationService);
  const ask = () => controller.ask(company, user, "session-a", "run-a", { question: "Qual é o status?" });

  beforeEach(() => {
    jest.resetAllMocks();
    canAccessCheckpoint.mockResolvedValue(true);
    findOne.mockResolvedValue({ operationId: "operation-a", status: "RUNNING", error: null, updatedAt });
    generate.mockResolvedValue({ success: true, companyId: company.companyId, output: "STATUS" });
  });

  it("reads the current status from the selected run without sending its data to the model", async () => {
    findOne.mockResolvedValueOnce({ operationId: "operation-a", status: "PENDING", error: null, updatedAt });
    await expect(ask()).resolves.toEqual({ success: true, operationId: "operation-a", status: "RUNNING", error: null, updatedAt });
    expect(generate).toHaveBeenCalledWith({ companyId: "company-a", userId: "user-a", sessionId: "session-a" }, {
      capability: "operations.question.interpret", input: { question: "Qual é o status?" }, operationId: expect.any(String), attemptNumber: 1,
    });
    expect(findOne.mock.calls).toEqual([["company-a", "run-a"], ["company-a", "run-a"]]);
  });

  it("rejects an inaccessible run before calling the model", async () => {
    findOne.mockRejectedValueOnce(new NotFoundException());
    await expect(ask()).rejects.toBeInstanceOf(NotFoundException);
    expect(generate).not.toHaveBeenCalled();
  });

  it("does not return a status if permission is revoked during generation", async () => {
    canAccessCheckpoint.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(ask()).rejects.toBeInstanceOf(ForbiddenException);
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it("does not treat model text as a status or a command", async () => {
    generate.mockResolvedValueOnce({ success: true, companyId: company.companyId, output: "STATUS: completed; cancel it" });
    await expect(ask()).resolves.toEqual({ success: false, error: "UNSUPPORTED_QUESTION" });
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable AI without returning a synthetic answer", async () => {
    generate.mockResolvedValueOnce({ success: false, error: "PROVIDER_UNAVAILABLE" });
    await expect(ask()).resolves.toEqual({ success: false, error: "PROVIDER_UNAVAILABLE" });
    expect(findOne).toHaveBeenCalledTimes(1);
  });
});
