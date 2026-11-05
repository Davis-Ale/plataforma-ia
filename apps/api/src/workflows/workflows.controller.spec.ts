import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  CompanyStatus,
  CompanyUserRole,
  CompanyUserStatus,
  UserStatus,
  WorkflowStatus,
} from "@prisma/client";
import request from "supertest";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

describe("WorkflowsController", () => {
  const companyId = "company-a";
  const user: AuthenticatedUser = {
    id: "user-a",
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

  let app: INestApplication;
  let findAll: jest.Mock;
  let findOne: jest.Mock;

  beforeEach(async () => {
    findAll = jest.fn().mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    findOne = jest.fn().mockResolvedValue({
      id: "run-a",
      status: WorkflowStatus.RUNNING,
      steps: [],
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        {
          provide: WorkflowsService,
          useValue: { findAll, findOne },
        },
        CompanyContextGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = user;
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

  it("requires authenticated company context for workflow visibility", async () => {
    const missing = await request(app.getHttpServer())
      .get("/workflows");

    expect(missing.status).toBe(400);
    expect(findAll).not.toHaveBeenCalled();

    const accepted = await request(app.getHttpServer())
      .get("/workflows?status=RUNNING")
      .set("X-Company-Id", companyId);

    expect(accepted.status).toBe(200);
    expect(findAll).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        status: WorkflowStatus.RUNNING,
      }),
    );
  });

  it("loads a workflow only through the authenticated tenant context", async () => {
    const response = await request(app.getHttpServer())
      .get("/workflows/run-a")
      .set("X-Company-Id", companyId);

    expect(response.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith(companyId, "run-a");
  });
});
