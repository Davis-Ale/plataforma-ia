import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthTokenService } from "./auth-token.service";

describe("AuthTokenService rotation", () => {
  const accessSecret = "access-test-secret";
  const refreshSecret = "refresh-test-secret";
  const user = { id: "user-a", email: "user-a@example.com" };
  const jwt = new JwtService();
  let service: AuthTokenService;

  beforeEach(() => {
    service = new AuthTokenService(jwt, new ConfigService({
      JWT_SECRET: accessSecret,
      JWT_REFRESH_SECRET: refreshSecret,
    }));
  });

  afterEach(() => jest.restoreAllMocks());

  it("issues different refresh tokens within the same second while preserving session identity", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_793_894_400_000);
    const first = await service.createTokenPair(user, "session-a");
    const next = await service.createTokenPair(user, "session-a");

    expect(next.refreshToken).not.toBe(first.refreshToken);
    const payload = await service.verifyRefreshToken(next.refreshToken);
    expect(payload).toMatchObject({ sub: user.id, email: user.email, sessionId: "session-a", type: "refresh" });
    expect(jwt.decode(first.refreshToken).jti).not.toBe(jwt.decode(next.refreshToken).jti);
    expect(await jwt.verifyAsync(next.accessToken, { secret: accessSecret })).toMatchObject({ type: "access" });
  });

  it.each([
    { sub: "user-a", email: user.email, type: "refresh" },
    { sub: "user-a", email: user.email, type: "refresh", sessionId: 123 },
    { sub: "", email: user.email, type: "refresh", sessionId: "session-a" },
    { sub: "user-a", email: null, type: "refresh", sessionId: "session-a" },
    { sub: "user-a", email: user.email, type: "access", sessionId: "session-a" },
  ])("rejects signed refresh payloads with invalid identity: %j", async (payload) => {
    const token = await jwt.signAsync(payload, { secret: refreshSecret });
    await expect(service.verifyRefreshToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects expired refresh tokens and signatures from another secret", async () => {
    const payload = { sub: user.id, email: user.email, type: "refresh", sessionId: "session-a" };
    const expired = await jwt.signAsync(payload, { secret: refreshSecret, expiresIn: -1 });
    const other = await jwt.signAsync(payload, { secret: accessSecret });
    await expect(service.verifyRefreshToken(expired)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.verifyRefreshToken(other)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
