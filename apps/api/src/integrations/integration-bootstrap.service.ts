import { Injectable, OnModuleInit } from "@nestjs/common";
import { CapabilityRegistry } from "../capabilities/capability-registry.service";
import { createContractsReadCapability } from "./contracts-read.capability";
import { createDemoContractsAdapter, DEMO_CONTRACTS_ADAPTER_KEY } from "./demo/demo-contracts.adapter";
import { createDemoOperationsAdapter, DEMO_OPERATIONS_ADAPTER_KEY } from "./demo/demo-operations.adapter";
import { createDemoPeopleAdapter, DEMO_PEOPLE_ADAPTER_KEY } from "./demo/demo-people.adapter";
import { IntegrationRegistry } from "./integration-registry.service";
import { IntegrationResolver } from "./integration-resolver.service";
import { createOperationsPlanCapability } from "./operations-plan.capability";
import { createPeopleCapacityCheckCapability } from "./people-capacity.capability";
import { createPncpContractsAdapter, PNCP_CONTRACTS_ADAPTER_KEY } from "./pncp-contracts.adapter";

@Injectable()
export class IntegrationBootstrapService implements OnModuleInit {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly resolver: IntegrationResolver,
    private readonly capabilities: CapabilityRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.registerContracts(createDemoContractsAdapter());
    this.registry.registerOperations(createDemoOperationsAdapter());
    this.registry.registerPeople(createDemoPeopleAdapter());
    this.registry.registerContracts(createPncpContractsAdapter());
    this.capabilities.register(createContractsReadCapability(this.resolver));
    this.capabilities.register(createOperationsPlanCapability(this.resolver));
    this.capabilities.register(createPeopleCapacityCheckCapability(this.resolver));
    const companyId = process.env.PNCP_CONTRACTS_COMPANY_ID?.trim();
    if (companyId) await this.enablePncpContractsForCompany(companyId);
  }

  async enablePncpContractsForCompany(companyId: string): Promise<void> {
    if ((await this.resolver.resolveContracts(companyId))?.key === PNCP_CONTRACTS_ADAPTER_KEY) return;
    try {
      await this.resolver.bind({ companyId, kind: "contracts", adapterKey: PNCP_CONTRACTS_ADAPTER_KEY });
    } catch (error) {
      if ((await this.resolver.resolveContracts(companyId))?.key !== PNCP_CONTRACTS_ADAPTER_KEY) throw error;
    }
  }

  async enableDemoIntegrationsForCompany(companyId: string): Promise<void> {
    if (typeof companyId !== "string" || companyId.trim() === "") {
      throw new Error("Invalid companyId");
    }
    const existing = await Promise.all([
      this.resolver.resolveContracts(companyId),
      this.resolver.resolveOperations(companyId),
      this.resolver.resolvePeople(companyId),
    ]);
    if (existing.some((value) => value !== undefined)) {
      throw new Error("Integration binding already exists");
    }
    await this.resolver.bind({
      companyId,
      kind: "contracts",
      adapterKey: DEMO_CONTRACTS_ADAPTER_KEY,
    });
    await this.resolver.bind({
      companyId,
      kind: "operations",
      adapterKey: DEMO_OPERATIONS_ADAPTER_KEY,
    });
    await this.resolver.bind({
      companyId,
      kind: "people",
      adapterKey: DEMO_PEOPLE_ADAPTER_KEY,
    });
  }
}
