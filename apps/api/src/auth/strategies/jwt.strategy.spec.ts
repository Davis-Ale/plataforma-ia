import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserStatus } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuthSessionService } from "../auth-session.service";
import { AuthenticatedRequest } from "../types/authenticated-request";
import { JwtPayload } from "../types/jwt-payload";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy session propagation", () => {
  const payload: JwtPayload = {
    sub: "user-a",
    email: "user-a@example.com",
    type: "access",
    sessionId: "session-a",
  };

  const activeUser = {
    id: payload.sub,
    name: "User A",
    email: payload.email,
    status: UserStatus.ACTIVE,
    companies: [],
  };

  let isActive: jest.Mock;
  let findUnique: jest.Mock;
  let strategy: JwtStrategy;
  let request: AuthenticatedRequest;

  beforeEach(() => {
    isActive = jest.fn().mockResolvedValue(true);
    findUnique = jest.fn().mockResolvedValue(activeUser);
    request = { headers: {} } as AuthenticatedRequest;
    strategy = new JwtStrategy(
      { user: { findUnique } } as unknown as PrismaService,
      { isActive } as unknown as AuthSessionService,
      { getOrThrow: () => "test-secret" } as unknown as ConfigService,
    );
  });

  it("passes the request into validate and copies payload.sessionId onto request.sessionId", async () => {
    const user = await strategy.validate(request, payload);

    expect(isActive).toHaveBeenCalledWith(payload.sessionId, payload.sub);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: payload.sub },
      select: expect.any(Object),
    });
    expect(user).toEqual(activeUser);
    expect(request.sessionId).toBe(payload.sessionId);
  });

  it.each([
    ["refresh token", { ...payload, type: "refresh" as const }],
    ["blank sessionId", { ...payload, sessionId: " " }],
    ["missing sessionId", { ...payload, sessionId: undefined } as unknown as JwtPayload],
    ["non-string sessionId", { ...payload, sessionId: 42 } as unknown as JwtPayload],
    ["missing user identity", { ...payload, sub: undefined } as unknown as JwtPayload],
    ["missing email", { ...payload, email: undefined } as unknown as JwtPayload],
  ])("rejects %s before session lookup and does not set request.sessionId", async (_label, invalidPayload) => {
    await expect(strategy.validate(request, invalidPayload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(isActive).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(request.sessionId).toBeUndefined();
  });

  it("rejects inactive session before user lookup and does not set request.sessionId", async () => {
    isActive.mockResolvedValue(false);

    await expect(strategy.validate(request, payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(isActive).toHaveBeenCalledWith(payload.sessionId, payload.sub);
    expect(findUnique).not.toHaveBeenCalled();
    expect(request.sessionId).toBeUndefined();
  });

  it.each([
    ["missing user", null],
    ["email mismatch", { ...activeUser, email: "other@example.com" }],
    ["inactive user", { ...activeUser, status: UserStatus.INACTIVE }],
  ])("rejects %s after session check and does not set request.sessionId", async (_label, user) => {
    findUnique.mockResolvedValue(user);

    await expect(strategy.validate(request, payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(isActive).toHaveBeenCalledWith(payload.sessionId, payload.sub);
    expect(findUnique).toHaveBeenCalled();
    expect(request.sessionId).toBeUndefined();
  });
});
