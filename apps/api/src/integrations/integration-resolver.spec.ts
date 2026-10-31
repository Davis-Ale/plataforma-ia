import { Test } from "@nestjs/testing";

jest.mock("../capabilities/capabilities.module", () => {
  const { Module: NestModule } = require("@nestjs/common");
  const { CapabilityRegistry: Registry } = require("../capabilities/capability-registry.service");
  @NestModule({
    providers: [Registry],
    exports: [Registry],
  })
  class CapabilitiesModule {}
  return { CapabilitiesModule };
});

import { CapabilityRegistry } from "../capabilities/capability-registry.service";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { PrepareOperationService } from "../scenarios/prepare-operation.service";
import { WorkflowsService } from "../workflows/workflows.service";
import { CONTRACTS_READ_KEY } from "./contracts-read.capability";
import { DEMO_CONTRACTS_ADAPTER_KEY } from "./demo/demo-contracts.adapter";
import { DEMO_OPERATIONS_ADAPTER_KEY } from "./demo/demo-operations.adapter";
import { DEMO_PEOPLE_ADAPTER_KEY } from "./demo/demo-people.adapter";
import {
  INTEGRATION_BINDING_STORE,
  InMemoryIntegrationBindingStore,
  IntegrationBindingStore,
} from "./integration-binding.store";
import { IntegrationBootstrapService } from "./integration-bootstrap.service";
import { IntegrationRegistry } from "./integration-registry.service";
import { IntegrationResolver } from "./integration-resolver.service";
import { IntegrationsModule } from "./integrations.module";
import {
  ContractsPort,
  ContractsReadInput,
  ContractsReadOutput,
  OperationsPlanOutput,
} from "./integration.types";
import { OPERATIONS_PLAN_KEY } from "./operations-plan.capability";
import { PEOPLE_CAPACITY_CHECK_KEY } from "./people-capacity.capability";

const ALT_CONTRACTS_ADAPTER_KEY = "alt-contracts";

function createAltContractsAdapter(): ContractsPort {
  return Object.freeze({
    key: ALT_CONTRACTS_ADAPTER_KEY,
    kind: "contracts" as const,
    async read(companyId: string, input: ContractsReadInput): Promise<ContractsReadOutput> {
      return Object.freeze({
        companyId,
        externalRef: input.externalRef.trim().toUpperCase(),
        name: "Contrato Real",
        clientName: "Cliente Real",
        startDate: "2026-11-01",
        status: "SIGNED",
        simulated: false,
        sourceAdapter: ALT_CONTRACTS_ADAPTER_KEY,
      });
    },
  });
}

describe("Integration resolution and generic capabilities", () => {
  let registry: IntegrationRegistry;
  let store: InMemoryIntegrationBindingStore;
  let resolver: IntegrationResolver;
  let capabilities: CapabilityRegistry;
  let bootstrap: IntegrationBootstrapService;

  beforeEach(() => {
    registry = new IntegrationRegistry();
    store = new InMemoryIntegrationBindingStore();
    resolver = new IntegrationResolver(registry, store);
    capabilities = new CapabilityRegistry();
    bootstrap = new IntegrationBootstrapService(registry, resolver, capabilities);
    bootstrap.onModuleInit();
  });

  it("registers generic capabilities without binding tenants", async () => {
    expect(capabilities.resolve(CONTRACTS_READ_KEY)?.key).toBe(CONTRACTS_READ_KEY);
    expect(capabilities.resolve(OPERATIONS_PLAN_KEY)?.key).toBe(OPERATIONS_PLAN_KEY);
    expect(capabilities.resolve(PEOPLE_CAPACITY_CHECK_KEY)?.key).toBe(PEOPLE_CAPACITY_CHECK_KEY);
    expect(await resolver.resolveContracts("company-a")).toBeUndefined();
  });

  it("fails closed when tenant has no integration binding", async () => {
    const capability = capabilities.resolve(CONTRACTS_READ_KEY)!;
    const context = {
      companyId: "company-x",
      userId: "u1",
      sessionId: "s1",
      role: "MEMBER" as const,
    };
    await expect(capability.execute(context, { externalRef: "ATLAS" })).rejects.toThrow(
      /INTEGRATION_UNAVAILABLE/,
    );
  });

  it("binds demo adapters per tenant explicitly", async () => {
    await bootstrap.enableDemoIntegrationsForCompany("company-a");
    expect((await resolver.resolveContracts("company-a"))?.key).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
    expect((await resolver.resolveOperations("company-a"))?.key).toBe(DEMO_OPERATIONS_ADAPTER_KEY);
    expect((await resolver.resolvePeople("company-a"))?.key).toBe(DEMO_PEOPLE_ADAPTER_KEY);
    expect(await resolver.resolveContracts("company-b")).toBeUndefined();
  });

  it("chains contracts -> operations -> people", async () => {
    await bootstrap.enableDemoIntegrationsForCompany("company-a");
    const ctx = {
      companyId: "company-a",
      userId: "u1",
      sessionId: "s1",
      role: "MEMBER" as const,
    };
    const contract = (await capabilities.resolve(CONTRACTS_READ_KEY)!.execute(ctx, {
      externalRef: "ATLAS",
    })) as ContractsReadOutput;
    const plan = (await capabilities.resolve(OPERATIONS_PLAN_KEY)!.execute(ctx, {
      contractExternalRef: contract.externalRef,
      contractName: contract.name,
      clientName: contract.clientName,
      startDate: contract.startDate,
    })) as OperationsPlanOutput;
    expect(plan).toMatchObject({
      companyId: "company-a",
      contractExternalRef: "ATLAS",
      simulated: true,
      sourceAdapter: DEMO_OPERATIONS_ADAPTER_KEY,
    });
    const capacity = await capabilities.resolve(PEOPLE_CAPACITY_CHECK_KEY)!.execute(ctx, {
      planId: plan.planId,
      workstreams: plan.workstreams,
      targetStartDate: plan.targetStartDate,
    });
    expect(capacity).toMatchObject({
      companyId: "company-a",
      planId: plan.planId,
      simulated: true,
      sourceAdapter: DEMO_PEOPLE_ADAPTER_KEY,
    });
  });

  it("replaces demo contracts adapter without changing capability or other tenants", async () => {
    await bootstrap.enableDemoIntegrationsForCompany("company-a");
    await bootstrap.enableDemoIntegrationsForCompany("company-b");
    registry.registerContracts(createAltContractsAdapter());

    const capability = capabilities.resolve(CONTRACTS_READ_KEY)!;
    const contextA = {
      companyId: "company-a",
      userId: "u1",
      sessionId: "s1",
      role: "MEMBER" as const,
    };
    const contextB = {
      companyId: "company-b",
      userId: "u2",
      sessionId: "s2",
      role: "MEMBER" as const,
    };

    const before = (await capability.execute(contextA, { externalRef: "ATLAS" })) as ContractsReadOutput;
    expect(before.sourceAdapter).toBe(DEMO_CONTRACTS_ADAPTER_KEY);

    await expect(
      resolver.replaceBinding({
        companyId: "company-a",
        kind: "contracts",
        adapterKey: "unknown-adapter",
      }),
    ).rejects.toThrow(/Unknown contracts adapter/);

    await expect(
      resolver.replaceBinding({
        companyId: "company-missing",
        kind: "contracts",
        adapterKey: ALT_CONTRACTS_ADAPTER_KEY,
      }),
    ).rejects.toThrow(/Integration binding not found/);

    await expect(
      resolver.replaceBinding({
        companyId: "company-a",
        kind: "contracts",
        adapterKey: DEMO_CONTRACTS_ADAPTER_KEY,
      }),
    ).rejects.toThrow(/Integration binding unchanged/);

    const replaced = await resolver.replaceBinding({
      companyId: "company-a",
      kind: "contracts",
      adapterKey: ALT_CONTRACTS_ADAPTER_KEY,
    });
    expect(replaced.adapterKey).toBe(ALT_CONTRACTS_ADAPTER_KEY);

    const after = (await capability.execute(contextA, { externalRef: "ATLAS" })) as ContractsReadOutput;
    expect(after.sourceAdapter).toBe(ALT_CONTRACTS_ADAPTER_KEY);
    expect(after.simulated).toBe(false);

    const tenantB = (await capability.execute(contextB, { externalRef: "ATLAS" })) as ContractsReadOutput;
    expect(tenantB.sourceAdapter).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
    expect(capability.key).toBe(CONTRACTS_READ_KEY);
  });

  it("rejects finance kind in this block", async () => {
    await expect(
      resolver.bind({
        companyId: "company-a",
        kind: "finance" as never,
        adapterKey: DEMO_CONTRACTS_ADAPTER_KEY,
      }),
    ).rejects.toThrow(/Invalid integration binding/);
  });

  it("resolves IntegrationResolver through Nest DI with INTEGRATION_BINDING_STORE token", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IntegrationsModule],
    }).compile();

    await moduleRef.init();

    const nestedResolver = moduleRef.get(IntegrationResolver);
    const nestedStore = moduleRef.get<IntegrationBindingStore>(INTEGRATION_BINDING_STORE);
    const nestedRegistry = moduleRef.get(IntegrationRegistry);

    expect(nestedResolver).toBeInstanceOf(IntegrationResolver);
    expect(nestedStore).toBeInstanceOf(InMemoryIntegrationBindingStore);

    await nestedStore.set("company-di", "contracts", DEMO_CONTRACTS_ADAPTER_KEY);
    const adapter = await nestedResolver.resolveContracts("company-di");
    expect(adapter?.key).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
    expect(await nestedStore.get("company-di", "contracts")).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
    expect(nestedRegistry.getContracts(DEMO_CONTRACTS_ADAPTER_KEY)?.key).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
  });

  it("unauthorized context does not create WorkflowRun or WorkflowStep", async () => {
    const createRun = jest.fn();
    const createStep = jest.fn();
    const startRun = jest.fn();
    const startStep = jest.fn();
    const completeStep = jest.fn();
    const failStep = jest.fn();
    const completeRun = jest.fn();
    const failRun = jest.fn();

    const authorization = {
      execute: jest.fn().mockResolvedValue({ success: false, error: "DENIED" }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrepareOperationService,
        {
          provide: WorkflowsService,
          useValue: {
            createRun,
            createStep,
            startRun,
            startStep,
            completeStep,
            failStep,
            completeRun,
            failRun,
          },
        },
        {
          provide: AuthorizationGateway,
          useValue: authorization,
        },
      ],
    }).compile();

    const service = moduleRef.get(PrepareOperationService);
    const result = await service.run(
      { companyId: "company-a", userId: "u1", sessionId: "s1" },
      { contractExternalRef: "ATLAS", operationId: "op-atlas" },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("DENIED");
    }
    expect(authorization.execute).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-a" }),
      expect.objectContaining({ capability: CONTRACTS_READ_KEY }),
    );
    expect(createRun).not.toHaveBeenCalled();
    expect(createStep).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it("invalid input does not create WorkflowRun or WorkflowStep", async () => {
    const createRun = jest.fn();
    const createStep = jest.fn();
    const startRun = jest.fn();
    const authorization = {
      execute: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrepareOperationService,
        {
          provide: WorkflowsService,
          useValue: {
            createRun,
            createStep,
            startRun,
            startStep: jest.fn(),
            completeStep: jest.fn(),
            failStep: jest.fn(),
            completeRun: jest.fn(),
            failRun: jest.fn(),
          },
        },
        {
          provide: AuthorizationGateway,
          useValue: authorization,
        },
      ],
    }).compile();

    const service = moduleRef.get(PrepareOperationService);
    const result = await service.run(
      { companyId: "company-a", userId: "u1", sessionId: "s1" },
      { contractExternalRef: "", operationId: "op-atlas" },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(authorization.execute).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
    expect(createStep).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it("rejects silent rebind of existing kind", async () => {
    await bootstrap.enableDemoIntegrationsForCompany("company-a");
    await expect(bootstrap.enableDemoIntegrationsForCompany("company-a")).rejects.toThrow(
      /Integration binding already exists/,
    );
  });
});
