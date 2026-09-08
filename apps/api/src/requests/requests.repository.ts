import { Injectable } from "@nestjs/common";
import {
  Prisma,
  RequestStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { FindRequestsQueryDto } from "./dto/find-requests-query.dto";

export type CreateRequestData = {
  createdByUserId: string;
  title: string;
  description: string;
  status: RequestStatus;
};

export type UpdateRequestData = {
  status: RequestStatus;
};

@Injectable()
export class RequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(companyId: string, data: CreateRequestData) {
    return this.prisma.request.create({
      data: {
        companyId,
        ...data,
      },
    });
  }

  findMany(
    companyId: string,
    query: FindRequestsQueryDto,
    skip: number,
    take: number,
    createdByUserId?: string,
  ) {
    const where = this.buildWhere(
      companyId,
      query,
      createdByUserId,
    );

    return Promise.all([
      this.prisma.request.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
        ],
        skip,
        take,
      }),
      this.prisma.request.count({ where }),
    ]);
  }

  findOne(
    companyId: string,
    id: string,
    createdByUserId?: string,
  ) {
    return this.prisma.request.findFirst({
      where: {
        id,
        companyId,
        createdByUserId,
      },
    });
  }

  update(
    companyId: string,
    id: string,
    data: UpdateRequestData,
  ) {
    return this.prisma.request.updateMany({
      where: {
        id,
        companyId,
      },
      data,
    });
  }

  private buildWhere(
    companyId: string,
    query: FindRequestsQueryDto,
    createdByUserId?: string,
  ): Prisma.RequestWhereInput {
    return {
      companyId,
      status: query.status,
      createdByUserId,
    };
  }
}
