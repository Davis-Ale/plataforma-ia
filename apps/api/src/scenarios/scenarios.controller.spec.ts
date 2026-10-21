import { ExecutionContext, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  CompanyStatus,
  CompanyUserRole,
  CompanyUserStatus,
  UserStatus,
} from "@prisma/client";
import request from "supertest";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import {
  PREPARE_OPERATION_WORKFLOW_KEY,
  PrepareOperationResult,
  PrepareOperationService,
} from "./prepare-operation.service";
import { ScenariosController } from "./scenarios.controller";

describe("ScenariosController", () => {
  const companyId = "company-a";
  const otherCompanyId = "company-b";
  const userId = "user-a";
  const sessionId = "session-a";
  const path = "/scenarios/operations/prepare-from-contract";

  const user: AuthenticatedUser = {
    id: userId,
    name: "User A",
    email: "user-a@example.com",
    status: UserStatus.ACTIVE,
    companies: [
      {
        id: "membership-a",
        role: CompanyUserRole.MEMBER,
        status: CompanyUserStatus.ACTIVE,
        company: {
          id: companyId,
          name: "Company A",
          status: CompanyStatus.ACTIVE,
        },
      },
    ],
  };

  const successResult: PrepareOperationResult = {
    success: true,
    companyId,
    workflowRunId: "run-a",
    workflowKey: PREPARE_OPERATION_WORKFLOW_KEY,
    steps: [],
    output: {
      contract: { externalRef: "ATLAS" },
      plan: { planId: "plan-a" },
      capacity: { available: true },
    },
  };

  let app: INestApplication;
  let run: jest.Mock;

  beforeEach(async () => {
    run = jest.fn().mockResolvedValue(successResult);
    const moduleRef = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [
        {
          provide: PrepareOperationService,
          useValue: { run },
        },
        CompanyContextGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = user;
          req.sessionId = sessionId;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("executes the existing scenario from authenticated tenant, user and session", async () => {
    const response = await request(app.getHttpServer())
      .post(path)
      .set("X-Company-Id", companyId)
      .send({ contractExternalRef: "ATLAS" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(successResult);
    expect(run).toHaveBeenCalledWith(
      {
        companyId,
        userId,
        sessionId,
      },
      {
        contractExternalRef: "ATLAS",
      },
    );
  });

  it("rejects invalid scenario input before calling PrepareOperationService", async () => {
    const empty = await request(app.getHttpServer())
      .post(path)
      .set("X-Company-Id", companyId)
      .send({ contractExternalRef: "" });

    expect(empty.status).toBe(400);
    expect(run).not.toHaveBeenCalled();

    const missing = await request(app.getHttpServer())
      .post(path)
      .set("X-Company-Id", companyId)
      .send({});

    expect(missing.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not trust companyId, userId or sessionId from the body", async () => {
    const rejected = await request(app.getHttpServer())
      .post(path)
      .set("X-Company-Id", companyId)
      .send({
        contractExternalRef: "ATLAS",
        companyId: otherCompanyId,
        userId: "user-b",
        sessionId: "session-b",
      });

    expect(rejected.status).toBe(400);
    expect(run).not.toHaveBeenCalled();

    const accepted = await request(app.getHttpServer())
      .post(path)
      .set("X-Company-Id", companyId)
      .send({ contractExternalRef: "ORION" });

    expect(accepted.status).toBe(201);
    expect(run).toHaveBeenCalledWith(
      {
        companyId,
        userId,
        sessionId,
      },
      {
        contractExternalRef: "ORION",
      },
    );
    expect(run.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({
        companyId: otherCompanyId,
        userId: "user-b",
        sessionId: "session-b",
      }),
    );
  });

  it("propagates the PrepareOperationService result without rewriting it", async () => {
    const denied: PrepareOperationResult = {
      success: false,
      companyId,
      error: "DENIED",
      failedStep: "read_contract",
      failedCapabilityKey: "contracts.read",
    };
    run.mockResolvedValueOnce(denied);

    const response = await request(app.getHttpServer())
      .post(path)
      .set("X-Company-Id", companyId)
      .send({ contractExternalRef: "ATLAS" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(denied);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
