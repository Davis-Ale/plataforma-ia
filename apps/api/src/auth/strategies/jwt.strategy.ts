import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { PassportStrategy } from "@nestjs/passport";
import { PrismaService } from "@plataforma/database";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthSessionService } from "../auth-session.service";
import { JwtPayload } from "../types/jwt-payload";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authSessionService: AuthSessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ??
        "local-development-jwt-secret-change-me",
    });
  }

  async validate(payload: JwtPayload) {
    const validPayload =
      payload.type === "access" &&
      payload.sessionId.trim().length > 0;

    if (validPayload === false) {
      throw new UnauthorizedException("Invalid token");
    }

    const activeSession = await this.authSessionService.isActive(
      payload.sessionId,
      payload.sub,
    );

    if (activeSession === false) {
      throw new UnauthorizedException("Invalid token");
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        companies: {
          select: {
            id: true,
            role: true,
            status: true,
            company: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    const validUser =
      user !== null &&
      user.email === payload.email &&
      user.status === UserStatus.ACTIVE;

    if (validUser === false) {
      throw new UnauthorizedException("Invalid token");
    }

    return user;
  }
}
