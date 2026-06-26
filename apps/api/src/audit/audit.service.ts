import { Injectable } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "@plataforma/database";

export type CreateAuditLogInput = {
  companyId: string;
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        metadata: input.metadata,
      },
    });
  }
}
