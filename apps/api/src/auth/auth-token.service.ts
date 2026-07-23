import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { JwtPayload } from "./types/jwt-payload";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;
const REFRESH_TOKEN_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

@Injectable()
export class AuthTokenService {
  constructor(private readonly jwtService: JwtService) {}

  async createTokenPair(user: { id: string; email: string }) {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: "access",
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: "refresh",
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.getAccessTokenSecret(),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.getRefreshTokenSecret(),
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
          secret: this.getRefreshTokenSecret(),
        },
      );

      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Invalid refresh token");
      }

      return payload;
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  private getAccessTokenSecret() {
    return (
      process.env.JWT_SECRET ??
      "local-development-jwt-secret-change-me"
    );
  }

  private getRefreshTokenSecret() {
    return (
      process.env.JWT_REFRESH_SECRET ??
      "local-development-refresh-secret-change-me"
    );
  }
}
