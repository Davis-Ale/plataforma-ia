import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { JwtPayload } from "./types/jwt-payload";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;
const REFRESH_TOKEN_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

@Injectable()
export class AuthTokenService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenSecret = this.configService.getOrThrow<string>("JWT_SECRET");
    this.refreshTokenSecret = this.configService.getOrThrow<string>("JWT_REFRESH_SECRET");
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

      if (payload.type === "refresh" && payload.sessionId.trim().length > 0) {
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
