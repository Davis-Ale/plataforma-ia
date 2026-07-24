import { Injectable } from "@nestjs/common";
import {
  CompanyUserRole,
  CompanyUserStatus,
} from "@prisma/client";
import { PasswordService } from "@plataforma/auth";
import { PrismaService } from "@plataforma/database";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async create(
    companyId: string,
    data: CreateUserDto,
  ) {
    const passwordHash = await this.passwordService.hash(
      data.password,
    );

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
        },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await transaction.companyUser.create({
        data: {
          companyId,
          userId: user.id,
          role: CompanyUserRole.MEMBER,
          status: CompanyUserStatus.ACTIVE,
        },
      });

      return user;
    });
  }

  async findAll(companyId: string) {
    return this.prisma.user.findMany({
      where: {
        companies: {
          some: {
            companyId,
            status: CompanyUserStatus.ACTIVE,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        companies: {
          where: {
            companyId,
          },
          select: {
            id: true,
            role: true,
            status: true,
          },
        },
      },
    });
  }
}
