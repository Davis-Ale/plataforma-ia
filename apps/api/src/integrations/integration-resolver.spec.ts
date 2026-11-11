import { Test } from "@nestjs/testing";
import { PrismaService } from "@plataforma/database";

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

  beforeEach(async () => {
    registry = new IntegrationRegistry();
    store = new InMemoryIntegrationBindingStore();
    resolver = new IntegrationResolver(registry, store);
    capabilities = new CapabilityRegistry();
    bootstrap = new IntegrationBootstrapService(registry, resolver, capabilities);
    await bootstrap.onModuleInit();
  });

  it("registers generic capabilities without binding tenants", async () => {
    expect(capabilities.resolve(CONTRACTS_READ_KEY)?.key).toBe(CONTRACTS_READ_KEY);
    expect(capabilities.resolve(OPERATIONS_PLAN_KEY)?.key).toBe(OPERATIONS_PLAN_KEY);
    expect(capabilities.resolve(PEOPLE_CAPACITY_CHECK_KEY)?.key).toBe(PEOPLE_CAPACITY_CHECK_KEY);
    expect(await resolver.resolveContracts("company-a")).toBeUndefined();
  });

  it("binds PNCP only to the selected company and never replaces another adapter", async () => {
    await bootstrap.enableDemoIntegrationsForCompany("company-b");
    await Promise.all([
      bootstrap.enablePncpContractsForCompany("company-a"),
      bootstrap.enablePncpContractsForCompany("company-a"),
    ]);
    expect((await resolver.resolveContracts("company-a"))?.key).toBe("pncp-contracts");
    expect(await resolver.resolveOperations("company-a")).toBeUndefined();
    expect(await resolver.resolveContracts("company-c")).toBeUndefined();
    await expect(bootstrap.enablePncpContractsForCompany("company-b")).rejects.toThrow("already exists");
    expect((await resolver.resolveContracts("company-b"))?.key).toBe("demo-contracts");
  });

  it("checks the PNCP reference before fetching and rejects mismatched responses", async () => {
    await bootstrap.enablePncpContractsForCompany("company-a");
    const adapter = (await resolver.resolveContracts("company-a"))!;
    const request = jest.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ numeroControlePNCP: "00000000000000-2-000002/2025" }));
    try {
      await expect(adapter.read("company-a", { externalRef: "https://example.com" })).rejects.toThrow("reference");
      expect(request).not.toHaveBeenCalled();
      await expect(adapter.read("company-a", { externalRef: "00000000000000-2-000001/2025" })).rejects.toThrow("response");
      expect(request).toHaveBeenCalledWith("https://pncp.gov.br/api/pncp/v1/orgaos/00000000000000/contratos/2025/1",
        expect.objectContaining({ redirect: "error" }));
    } finally {
      request.mockRestore();
    }
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
    }).overrideProvider(INTEGRATION_BINDING_STORE).useValue(new InMemoryIntegrationBindingStore())
      .overrideProvider(PrismaService).useValue({}).compile();

    await moduleRef.init();

    const nestedResolver = moduleRef.get(IntegrationResolver);
    const nestedStore = moduleRef.get<IntegrationBindingStore>(INTEGRATION_BINDING_STORE);
    const nestedRegistry = moduleRef.get(IntegrationRegistry);

    expect(nestedResolver).toBeInstanceOf(IntegrationResolver);
    expect(nestedStore).toBeInstanceOf(InMemoryIntegrationBindingStore);

    await nestedStore.create({ companyId: "company-di", kind: "contracts", adapterKey: DEMO_CONTRACTS_ADAPTER_KEY });
    const adapter = await nestedResolver.resolveContracts("company-di");
    expect(adapter?.key).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
    expect(await nestedStore.find("company-di", "contracts")).toMatchObject({ adapterKey: DEMO_CONTRACTS_ADAPTER_KEY, revision: 1 });
    expect(nestedRegistry.getContracts(DEMO_CONTRACTS_ADAPTER_KEY)?.key).toBe(DEMO_CONTRACTS_ADAPTER_KEY);
  });

  it("rejects silent rebind of existing kind", async () => {
    await bootstrap.enableDemoIntegrationsForCompany("company-a");
    await expect(bootstrap.enableDemoIntegrationsForCompany("company-a")).rejects.toThrow(
      /Integration binding already exists/,
    );
  });

  it("pins the approved adapter within one request without changing concurrent tenant bindings", async () => {
    await bootstrap.enableDemoIntegrationsForCompany("company-a");
    const original = (await resolver.resolveContracts("company-a"))!;
    const replacement = { ...original, key: "replacement-contracts" };
    registry.registerContracts(replacement);
    await resolver.replaceBinding({ companyId: "company-a", kind: "contracts", adapterKey: replacement.key });
    const pinned = resolver.withAdapter("company-a", original, async () => {
      await Promise.resolve();
      expect((await resolver.resolveContracts("company-a"))?.key).toBe(original.key);
      expect(await resolver.resolveContracts("company-b")).toBeUndefined();
    });
    expect((await resolver.resolveContracts("company-a"))?.key).toBe(replacement.key);
    await pinned;
    expect((await resolver.resolveContracts("company-a"))?.key).toBe(replacement.key);
  });

  it("does not overwrite an integration during concurrent first-time bindings", async () => {
    const binding = { companyId: "company-race", kind: "contracts" as const, adapterKey: DEMO_CONTRACTS_ADAPTER_KEY };
    const results = await Promise.allSettled([resolver.bind(binding), resolver.bind(binding)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await store.find(binding.companyId, binding.kind)).toMatchObject({ ...binding, revision: 1 });
  });

  it("rejects stale revisions even when an adapter binding returns to its previous key", async () => {
    const original = { companyId: "company-revision", kind: "contracts" as const, adapterKey: "first" };
    await store.create(original);
    await store.replace({ ...original, adapterKey: "second" }, 1);
    await store.replace(original, 2);
    expect(await store.replace({ ...original, adapterKey: "stale" }, 1)).toBe(false);
    expect(await store.find(original.companyId, original.kind)).toMatchObject({ ...original, revision: 3 });
  });
});
