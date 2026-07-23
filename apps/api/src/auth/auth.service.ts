import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { PasswordService } from "@plataforma/auth";
import { PrismaService } from "@plataforma/database";
import { AuthTokenService } from "./auth-token.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async login(data: LoginDto) {
    const user = await this.findUserByEmail(data.email);

    if (
      user === null ||
      user.passwordHash === null ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await this.passwordService.verify(
      data.password,
      user.passwordHash,
    );

    if (passwordMatches === false) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const tokens = await this.authTokenService.createTokenPair(user);

    return {
      ...tokens,
      user: this.toAuthenticatedUser(user),
    };
  }

  async refresh(data: RefreshTokenDto) {
    const payload = await this.authTokenService.verifyRefreshToken(
      data.refreshToken,
    );

    const user = await this.findUserById(payload.sub);

    if (
      user === null ||
      user.email !== payload.email ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return this.authTokenService.createTokenPair(user);
  }

  private findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
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
  }

  private findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
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
  }

  private toAuthenticatedUser<
    T extends {
      id: string;
      name: string;
      email: string;
      status: UserStatus;
      companies: unknown[];
    },
  >(user: T) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      companies: user.companies,
    };
  }
}
