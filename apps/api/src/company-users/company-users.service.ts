import { Injectable } from "@nestjs/common";
import { PrismaService } from "@plataforma/database";
import { CreateCompanyUserDto } from "./dto/create-company-user.dto";

@Injectable()
export class CompanyUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCompanyUserDto) {
    return this.prisma.companyUser.create({
      data: {
        companyId: data.companyId,
        userId: data.userId,
        role: data.role,
      },
      include: {
        company: { select: { id: true, name: true, status: true } },
        user: { select: { id: true, name: true, email: true, status: true } },
      },
    });
  }

  async findAll() {
    return this.prisma.companyUser.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { id: true, name: true, status: true } },
        user: { select: { id: true, name: true, email: true, status: true } },
      },
    });
  }
}
