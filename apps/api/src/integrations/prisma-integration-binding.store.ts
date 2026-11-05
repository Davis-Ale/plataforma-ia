import { Injectable } from "@nestjs/common";
import { PrismaService } from "@plataforma/database";
import { Prisma } from "@prisma/client";
import { IntegrationBindingRecord, IntegrationBindingStore } from "./integration-binding.store";
import { IntegrationBinding, IntegrationKind } from "./integration.types";

@Injectable()
export class PrismaIntegrationBindingStore implements IntegrationBindingStore {
  constructor(private readonly prisma: PrismaService) {}

  async find(companyId: string, kind: IntegrationKind): Promise<IntegrationBindingRecord | undefined> {
    const binding = await this.prisma.integrationBinding.findFirst({
      where: { companyId, kind, company: { status: "ACTIVE" } },
      select: { companyId: true, kind: true, adapterKey: true, revision: true },
    });
    return binding ? Object.freeze(binding) : undefined;
  }

  async create(binding: IntegrationBinding): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCompany(tx, binding.companyId);
      const existing = await tx.integrationBinding.findUnique({ where: { companyId_kind: { companyId: binding.companyId, kind: binding.kind } } });
      if (existing) return false;
      const created = await tx.integrationBinding.create({ data: binding });
      await this.audit(tx, created.id, binding, 1);
      return true;
    });
  }

  async replace(binding: IntegrationBinding, expectedRevision: number): Promise<boolean> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Invalid integration binding revision");
    return this.prisma.$transaction(async (tx) => {
      await this.lockCompany(tx, binding.companyId);
      const current = await tx.integrationBinding.findUnique({ where: { companyId_kind: { companyId: binding.companyId, kind: binding.kind } } });
      if (!current || current.revision !== expectedRevision || current.adapterKey === binding.adapterKey) return false;
      const updated = await tx.integrationBinding.updateMany({
        where: { id: current.id, companyId: binding.companyId, revision: expectedRevision },
        data: { adapterKey: binding.adapterKey, revision: { increment: 1 } },
      });
      if (updated.count !== 1) return false;
      await this.audit(tx, current.id, binding, expectedRevision + 1, current.adapterKey);
      return true;
    });
  }

  private async lockCompany(tx: Prisma.TransactionClient, companyId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM companies WHERE id = ${companyId} AND status = 'ACTIVE' FOR UPDATE`;
    if (rows.length !== 1) throw new Error("Active integration company not found");
  }

  private audit(tx: Prisma.TransactionClient, id: string, binding: IntegrationBinding, revision: number, previousAdapterKey?: string) {
    return tx.auditLog.create({ data: {
      companyId: binding.companyId, action: previousAdapterKey === undefined ? "CREATE" : "UPDATE",
      resource: "integration_binding", resourceId: id,
      metadata: { kind: binding.kind, adapterKey: binding.adapterKey, revision,
        ...(previousAdapterKey === undefined ? {} : { previousAdapterKey }) },
    } });
  }
}
