import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { CompanyStatus, CompanyUserRole, CompanyUserStatus, UserStatus } from "@prisma/client";
import { PasswordService } from "@plataforma/auth";
import { PrismaService } from "@plataforma/database";
import request from "supertest";
import { WorkflowsController } from "../workflows/workflows.controller";
import { WorkflowsService } from "../workflows/workflows.service";
import { AuthSessionService } from "./auth-session.service";
import { AuthTokenService } from "./auth-token.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CompanyContextGuard } from "./guards/company-context.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { LoginRateLimitService } from "./login-rate-limit.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { AuthenticatedUser } from "./types/authenticated-user";

type Session = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

describe("Authentication and company navigation HTTP", () => {
  const userId = "user-a";
  const password = "test-password-123";
  const config = new ConfigService({
    JWT_SECRET: "access-http-test-secret",
    JWT_REFRESH_SECRET: "refresh-http-test-secret",
  });
  const memberships: AuthenticatedUser["companies"] = ["company-a", "company-b"].map((id) => ({
    id: `membership-${id}`,
    role: CompanyUserRole.MEMBER,
    status: CompanyUserStatus.ACTIVE,
    company: { id, name: id, status: CompanyStatus.ACTIVE },
  }));

  let app: INestApplication;
  let sessions: Map<string, Session>;
  let user: {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    status: UserStatus;
    companies: typeof memberships;
  };
  let findAll: jest.Mock;
  let findOne: jest.Mock;

  function matches(session: Session, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "expiresAt") return session.expiresAt > (value as { gt: Date }).gt;
      return session[key as keyof Session] === value;
    });
  }

  beforeAll(async () => {
    const passwords = new PasswordService();
    user = {
      id: userId,
      email: "user-a@example.com",
      name: "User A",
      status: UserStatus.ACTIVE,
      passwordHash: await passwords.hash(password),
      companies: memberships,
    };
    const prisma = {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id !== undefined ? where.id !== user.id : where.email !== user.email) return null;
          const { passwordHash: _passwordHash, ...authenticatedUser } = user;
          return where.email === undefined ? authenticatedUser : user;
        }),
      },
      authSession: {
        create: jest.fn(async ({ data }: { data: Omit<Session, "revokedAt"> }) => {
          const session = { ...data, revokedAt: null };
          sessions.set(session.id, session);
          return session;
        }),
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          return [...sessions.values()].find((session) => matches(session, where)) ?? null;
        }),
        updateMany: jest.fn(async ({ where, data }: {
          where: Record<string, unknown>;
          data: Partial<Session>;
        }) => {
          const found = [...sessions.values()].filter((session) => matches(session, where));
          found.forEach((session) => Object.assign(session, data));
          return { count: found.length };
        }),
      },
    };
    findAll = jest.fn(async (companyId: string) => ({ items: [{ id: `run-${companyId}` }], meta: { total: 1 } }));
    findOne = jest.fn(async (companyId: string, id: string) => ({ id, companyId }));
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({}), PassportModule.register({ defaultStrategy: "jwt" })],
      controllers: [AuthController, WorkflowsController],
      providers: [
        AuthService, AuthTokenService, AuthSessionService, JwtStrategy, JwtAuthGuard, CompanyContextGuard,
        { provide: PasswordService, useValue: passwords },
        { provide: ConfigService, useValue: config },
        { provide: LoginRateLimitService, useValue: { retryAfter: async () => 0 } },
        { provide: PrismaService, useValue: prisma },
        { provide: WorkflowsService, useValue: { findAll, findOne } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    sessions = new Map();
    user.status = UserStatus.ACTIVE;
    memberships.forEach((membership) => {
      membership.status = CompanyUserStatus.ACTIVE;
      membership.company.status = CompanyStatus.ACTIVE;
    });
    findAll.mockClear();
    findOne.mockClear();
  });

  afterAll(async () => app.close());

  async function login() {
    const response = await request(app.getHttpServer()).post("/auth/login").send({ email: user.email, password });
    expect(response.status).toBe(201);
    return response.body as { accessToken: string; refreshToken: string; user: { passwordHash?: string } };
  }

  it("uses real JWT guards for login and company-scoped workflow queries", async () => {
    const tokens = await login();
    expect(tokens.user.passwordHash).toBeUndefined();
    const anonymous = await request(app.getHttpServer()).get("/workflows").set("X-Company-Id", "company-a");
    expect(anonymous.status).toBe(401);
    for (const companyId of ["company-a", "company-b"]) {
      const response = await request(app.getHttpServer()).get("/workflows")
        .auth(tokens.accessToken, { type: "bearer" }).set("X-Company-Id", companyId);
      expect(response.status).toBe(200);
      expect(findAll).toHaveBeenLastCalledWith(companyId, expect.any(Object));
    }
  });

  it("denies missing, foreign and inactive company context before accessing workflows", async () => {
    const tokens = await login();
    const missing = await request(app.getHttpServer()).get("/workflows").auth(tokens.accessToken, { type: "bearer" });
    expect(missing.status).toBe(400);
    const foreign = await request(app.getHttpServer()).get("/workflows/run-foreign")
      .auth(tokens.accessToken, { type: "bearer" }).set("X-Company-Id", "company-foreign");
    expect(foreign.status).toBe(403);
    memberships[0]!.status = CompanyUserStatus.INACTIVE;
    const inactiveMembership = await request(app.getHttpServer()).get("/workflows")
      .auth(tokens.accessToken, { type: "bearer" }).set("X-Company-Id", "company-a");
    expect(inactiveMembership.status).toBe(403);
    memberships[0]!.status = CompanyUserStatus.ACTIVE;
    memberships[0]!.company.status = CompanyStatus.INACTIVE;
    const inactiveCompany = await request(app.getHttpServer()).get("/workflows")
      .auth(tokens.accessToken, { type: "bearer" }).set("X-Company-Id", "company-a");
    expect(inactiveCompany.status).toBe(403);
    expect(findAll).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });

  it("rotates refresh tokens, rejects replay and revokes access when logging out", async () => {
    const first = await login();
    const renewed = await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken: first.refreshToken });
    expect(renewed.status).toBe(201);
    expect(renewed.body.refreshToken).not.toBe(first.refreshToken);
    const replay = await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    const logout = await request(app.getHttpServer()).post("/auth/logout").send({ refreshToken: renewed.body.refreshToken });
    expect(logout.status).toBe(201);
    const access = await request(app.getHttpServer()).get("/auth/me").auth(renewed.body.accessToken, { type: "bearer" });
    expect(access.status).toBe(401);
    const afterLogout = await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken: renewed.body.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it("rejects expired and malformed signed access tokens with 401", async () => {
    const first = await login();
    const jwt = app.get(JwtService);
    const original = jwt.decode(first.accessToken) as { sessionId: string };
    const payload = { sub: userId, email: user.email, type: "access", sessionId: original.sessionId };
    const expired = await jwt.signAsync(payload, { secret: config.getOrThrow("JWT_SECRET"), expiresIn: -1 });
    const malformed = await jwt.signAsync({ ...payload, sessionId: 42 }, { secret: config.getOrThrow("JWT_SECRET") });
    for (const token of [expired, malformed, first.refreshToken]) {
      const response = await request(app.getHttpServer()).get("/auth/me").auth(token, { type: "bearer" });
      expect(response.status).toBe(401);
    }
  });

  it("accepts only one concurrent refresh for the same token", async () => {
    const tokens = await login();
    const responses = await Promise.all([1, 2].map(() => request(app.getHttpServer())
      .post("/auth/refresh").send({ refreshToken: tokens.refreshToken })));

    expect(responses.map((response) => response.status).sort()).toEqual([201, 401]);
  });

  it("rejects bad passwords and revalidates a disabled user on an existing session", async () => {
    const invalid = await request(app.getHttpServer()).post("/auth/login").send({ email: user.email, password: "wrong-password" });
    expect(invalid.status).toBe(401);
    expect(sessions.size).toBe(0);
    const tokens = await login();
    user.status = UserStatus.INACTIVE;
    const response = await request(app.getHttpServer()).get("/auth/me").auth(tokens.accessToken, { type: "bearer" });
    expect(response.status).toBe(401);
  });
});
