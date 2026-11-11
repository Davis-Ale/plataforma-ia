import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { JwtPayload } from "./types/jwt-payload";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;
const REFRESH_TOKEN_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
const EXAMPLE_JWT_SECRETS = new Set([
  "sua-chave-secreta-aqui-trocar-em-producao",
  "sua-chave-refresh-aqui-trocar-em-producao",
]);

@Injectable()
export class AuthTokenService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenSecret = this.readSecret("JWT_SECRET");
    this.refreshTokenSecret = this.readSecret("JWT_REFRESH_SECRET");
    if (this.accessTokenSecret.trim() === this.refreshTokenSecret.trim()) {
      throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be different");
    }
  }

  private readSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string {
    const secret = this.configService.getOrThrow<string>(name);
    if (typeof secret !== "string" || secret.trim() === "") {
      throw new Error(`${name} must be configured`);
    }
    if (this.configService.get<string>("NODE_ENV") === "production" &&
      (Buffer.byteLength(secret.trim(), "utf8") < 32 || EXAMPLE_JWT_SECRETS.has(secret.trim()))) {
      throw new Error(`${name} must use a private key of at least 32 bytes in production`);
    }
    return secret;
  }

  async createTokenPair(
    user: {
      id: string;
      email: string;
    },
    sessionId: string,
  ) {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: "access",
      sessionId,
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: "refresh",
      sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.accessTokenSecret,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshTokenSecret,
        expiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
        jwtid: randomUUID(),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    };
  }

  async verifyRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: this.refreshTokenSecret,
        },
      );

      if (
        payload.type === "refresh" &&
        [payload.sub, payload.email, payload.sessionId].every(
          (value) => typeof value === "string" && value.trim().length > 0,
        )
      ) {
        return payload;
      }

      throw new UnauthorizedException("Invalid refresh token");
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  getRefreshTokenExpirationDate() {
    return new Date(
      Date.now() + REFRESH_TOKEN_EXPIRES_IN_SECONDS * 1000,
    );
  }

}
