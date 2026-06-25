import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PasswordService } from "@plataforma/auth";
import { PrismaService } from "@plataforma/database";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async login(data: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
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

    if (user === null || user.passwordHash === null) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await this.passwordService.verify(data.password, user.passwordHash);

    if (passwordMatches === false) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        companies: user.companies,
      },
    };
  }
}
