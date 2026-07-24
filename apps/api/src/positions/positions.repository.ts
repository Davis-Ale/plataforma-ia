import { Injectable } from "@nestjs/common";
import { PrismaService } from "@plataforma/database";

export type CreatePositionData = {
  name: string;
  description?: string;
};

export type UpdatePositionData = {
  name?: string;
  description?: string;
};

@Injectable()
export class PositionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    companyId: string,
    data: CreatePositionData,
  ) {
    return this.prisma.position.create({
      data: {
        companyId,
        name: data.name,
        description: data.description,
      },
    });
  }

  findAll(companyId: string) {
    return this.prisma.position.findMany({
      where: {
        companyId,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  findOne(
    companyId: string,
    id: string,
  ) {
    return this.prisma.position.findFirst({
      where: {
        id,
        companyId,
      },
    });
  }

  update(
    companyId: string,
    id: string,
    data: UpdatePositionData,
  ) {
    return this.prisma.position.updateMany({
      where: {
        id,
        companyId,
      },
      data: {
        name: data.name,
        description: data.description,
      },
    });
  }

  remove(
    companyId: string,
    id: string,
  ) {
    return this.prisma.position.deleteMany({
      where: {
        id,
        companyId,
      },
    });
  }
}
