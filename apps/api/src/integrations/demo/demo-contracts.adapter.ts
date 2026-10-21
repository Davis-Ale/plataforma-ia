import { ContractsPort, ContractsReadInput, ContractsReadOutput } from "../integration.types";

const DEMO_CONTRACTS: Readonly<
  Record<string, Readonly<{ name: string; clientName: string; startDate: string; status: string }>>
> = Object.freeze({
  ATLAS: Object.freeze({
    name: "Contrato Atlas",
    clientName: "Atlas Industrial",
    startDate: "2026-11-01",
    status: "SIGNED",
  }),
  ORION: Object.freeze({
    name: "Contrato Orion",
    clientName: "Orion Servicos",
    startDate: "2026-12-01",
    status: "SIGNED",
  }),
});

export const DEMO_CONTRACTS_ADAPTER_KEY = "demo-contracts";

export function createDemoContractsAdapter(): ContractsPort {
  return Object.freeze({
    key: DEMO_CONTRACTS_ADAPTER_KEY,
    kind: "contracts" as const,
    async read(companyId: string, input: ContractsReadInput): Promise<ContractsReadOutput> {
      if (typeof companyId !== "string" || companyId.trim() === "") {
        throw new Error("Invalid companyId");
      }
      if (!input || typeof input.externalRef !== "string" || input.externalRef.trim() === "") {
        throw new Error("Invalid contracts read input");
      }
      const ref = input.externalRef.trim().toUpperCase();
      const found = DEMO_CONTRACTS[ref];
      if (!found) {
        throw new Error("Contract not found");
      }
      return Object.freeze({
        companyId,
        externalRef: ref,
        name: found.name,
        clientName: found.clientName,
        startDate: found.startDate,
        status: found.status,
        simulated: true,
        sourceAdapter: DEMO_CONTRACTS_ADAPTER_KEY,
      });
    },
  });
}
