import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "@plataforma/database";
import { JwtPayload } from "./types/jwt-payload";

@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

  createSessionId() {
    return randomUUID();
  }

  async create(
    sessionId: string,
    userId: string,
    refreshToken: string,
    expiresAt: Date,
  ) {
    return this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        expiresAt,
      },
    });
  }

  async validateRefreshSession(
    payload: JwtPayload,
    refreshToken: string,
  ) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (session === null) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return session;
  }

  async rotate(
    payload: JwtPayload,
    previousRefreshToken: string,
    nextRefreshToken: string,
    expiresAt: Date,
  ) {
    const result = await this.prisma.authSession.updateMany({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        refreshTokenHash: this.hashRefreshToken(previousRefreshToken),
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        refreshTokenHash: this.hashRefreshToken(nextRefreshToken),
        expiresAt,
      },
    });

    if (result.count === 0) {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  async revoke(payload: JwtPayload, refreshToken: string) {
    const result = await this.prisma.authSession.updateMany({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return {
      loggedOut: true,
    };
  }

  async revokeAll(userId: string) {
    const result = await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      loggedOut: true,
      revokedSessions: result.count,
    };
  }

  async isActive(sessionId: string, userId: string) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
      },
    });

    return session !== null;
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash("sha256")
      .update(refreshToken)
      .digest("hex");
  }
}
