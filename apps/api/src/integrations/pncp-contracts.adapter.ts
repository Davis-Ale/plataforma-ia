import { ContractsPort } from "./integration.types";

export const PNCP_CONTRACTS_ADAPTER_KEY = "pncp-contracts";
const CONTRACT_ID = /^(\d{14})-2-(\d{6})\/(\d{4})$/;
const MAX_RESPONSE_BYTES = 64 * 1024;

async function readContract(response: Response) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("PNCP contract unavailable");
  }
  if (!response.body) throw new Error("PNCP contract unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("PNCP contract response too large");
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as {
      numeroControlePNCP?: unknown;
      objetoContrato?: unknown;
      orgaoEntidade?: { cnpj?: unknown; razaoSocial?: unknown; razaosocial?: unknown };
      dataVigenciaInicio?: unknown;
      dataPublicacaoPncp?: unknown;
    } | null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export function createPncpContractsAdapter(): ContractsPort {
  return {
    key: PNCP_CONTRACTS_ADAPTER_KEY,
    kind: "contracts",
    replaySafety: "READ_ONLY",
    async read(companyId, { externalRef }) {
      const reference = externalRef.trim();
      const match = CONTRACT_ID.exec(reference);
      if (!match || Number(match[2]) === 0) throw new Error("Invalid PNCP contract reference");
      const [, cnpj, sequence, year] = match;
      const response = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/contratos/${year}/${Number(sequence)}`, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      const contract = await readContract(response);
      const name = contract?.objetoContrato;
      const clientName = contract?.orgaoEntidade?.razaoSocial ?? contract?.orgaoEntidade?.razaosocial;
      const startDate = contract?.dataVigenciaInicio;
      const publishedAt = contract?.dataPublicacaoPncp;
      if (contract?.numeroControlePNCP !== reference || contract?.orgaoEntidade?.cnpj !== cnpj ||
        typeof name !== "string" || !name.trim() || typeof clientName !== "string" || !clientName.trim() ||
        typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(startDate)) ||
        typeof publishedAt !== "string" || !Number.isFinite(Date.parse(publishedAt))) {
        throw new Error("Invalid PNCP contract response");
      }
      return {
        companyId, externalRef: reference, name: name.trim(), clientName: clientName.trim(), startDate,
        status: "PUBLISHED_IN_PNCP", simulated: false, sourceAdapter: PNCP_CONTRACTS_ADAPTER_KEY,
      };
    },
  };
}
