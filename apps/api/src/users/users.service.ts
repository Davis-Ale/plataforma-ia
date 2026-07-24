import { Injectable } from "@nestjs/common";
import {
  AuditAction,
  CompanyUserRole,
  CompanyUserStatus,
} from "@prisma/client";
import { PasswordService } from "@plataforma/auth";
import { PrismaService } from "@plataforma/database";
import { AuditService } from "../audit/audit.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    companyId: string,
    actorUserId: string,
    data: CreateUserDto,
  ) {
    const passwordHash = await this.passwordService.hash(
      data.password,
    );

    const user = await this.prisma.$transaction(
      async (transaction) => {
        const createdUser = await transaction.user.create({
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
            userId: createdUser.id,
            role: CompanyUserRole.MEMBER,
            status: CompanyUserStatus.ACTIVE,
          },
        });

        return createdUser;
      },
    );

    await this.auditService.create({
      companyId,
      userId: actorUserId,
      action: AuditAction.CREATE,
      resource: "user",
      resourceId: user.id,
      metadata: {
        email: user.email,
        role: CompanyUserRole.MEMBER,
      },
    });

    return user;
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
