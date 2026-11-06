"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RequestScope } from "../lib/request-scope";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
type Approval = {
  id: string; capabilityKey: string; status: ApprovalStatus; createdAt: string; decidedAt: string | null;
  requestedByYou: boolean; requestedBy: { id: string; name: string }; canDecide: boolean;
  review: null | { workflowRunId: string; workflowKey: string; stepKey: string; operationId: string;
    fields: Array<{ label: string; value: string }>; token: string };
};
type ApprovalPage = { items: Approval[]; meta: { page: number; limit: number; total: number; totalPages: number } };
const labels: Record<ApprovalStatus, string> = { PENDING: "Pendente", APPROVED: "Aprovada", REJECTED: "Rejeitada" };
const operations: Record<string, string> = { "contracts.read": "Consultar contrato", "operations.plan": "Planejar operação", "people.capacity.check": "Verificar capacidade" };

export function WorkflowApprovals({ companyId, onSessionExpired, onOpenRun }: Readonly<{
  companyId: string; onSessionExpired: () => void; onOpenRun: (id: string) => void;
}>) {
  const [status, setStatus] = useState<ApprovalStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApprovalPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const lists = useRef(new RequestScope());
  const actions = useRef(new RequestScope());

  const load = useCallback(async () => {
    const pending = lists.current.start();
    setData(null);
    setMessage("");
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const query = new URLSearchParams({ companyId, page: String(page), status });
      const response = await fetch(`/api/approvals/executions?${query.toString()}`, { cache: "no-store", signal: pending.signal });
      if (!pending.isCurrent()) return;
      if (response.status === 401) { onSessionExpired(); return; }
      if (!response.ok) { setMessage("Não foi possível carregar as aprovações. Confira seu acesso e atualize."); return; }
      const result = await response.json() as ApprovalPage;
      if (pending.isCurrent()) setData(result);
    } catch {
      if (pending.isCurrent()) setMessage("Não foi possível consultar as aprovações. Verifique a conexão.");
    } finally {
      if (pending.isCurrent()) setLoading(false);
    }
  }, [companyId, page, status, onSessionExpired]);

  useEffect(() => {
    actions.current.cancel();
    setDeciding(null);
    setNotice("");
    void load();
    const listScope = lists.current;
    const actionScope = actions.current;
    return () => { listScope.cancel(); actionScope.cancel(); };
  }, [load]);

  async function decide(approval: Approval, decision: "APPROVED" | "REJECTED") {
    if (!approval.canDecide || !approval.review || deciding) return;
    const pending = actions.current.start();
    setDeciding(approval.id);
    setMessage("");
    setNotice("");
    try {
      const response = await fetch(`/api/approvals/executions/${encodeURIComponent(approval.id)}/decision?companyId=${encodeURIComponent(companyId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewToken: approval.review.token }), signal: pending.signal,
      });
      if (!pending.isCurrent()) return;
      if (response.status === 401) { onSessionExpired(); return; }
      if (!response.ok) {
        await load();
        if (pending.isCurrent()) setMessage("A decisão não foi registrada. Confira novamente os dados e sua permissão antes de tentar.");
        return;
      }
      await load();
      if (pending.isCurrent()) setNotice(decision === "APPROVED" ? "Aprovação registrada. O solicitante pode retomar a execução."
        : "Rejeição registrada. A etapa não será executada com essa solicitação.");
    } catch {
      if (pending.isCurrent()) setMessage("A conexão foi interrompida. Atualize para conferir se a decisão foi registrada.");
    } finally {
      if (pending.isCurrent()) setDeciding(null);
    }
  }

  return (
    <section aria-label="Aprovações de execuções" id="aprovacoes" tabIndex={-1}>
      <div className="toolbar">
        <div><p className="section-kicker">Decisão humana</p><h2>Aprovações</h2></div>
        <div className="toolbar-actions">
          <select aria-label="Filtrar aprovações" value={status} disabled={!companyId || deciding !== null}
            onChange={(event) => { setPage(1); setStatus(event.target.value as ApprovalStatus); }}>
            <option value="PENDING">Pendentes</option><option value="APPROVED">Aprovadas</option><option value="REJECTED">Rejeitadas</option>
          </select>
          <button className="secondary" type="button" disabled={!companyId || loading || deciding !== null} onClick={() => void load()}>Atualizar aprovações</button>
        </div>
      </div>
      {message ? <p className="alert" role="alert">{message}</p> : null}
      {notice ? <p className="alert notice" role="status">{notice}</p> : null}
      <div className="approval-list" aria-busy={loading}>
        {loading ? <div className="empty-state" role="status">Carregando aprovações…</div>
          : !companyId ? <div className="empty-state"><strong>Nenhuma empresa ativa</strong></div>
          : !data?.items.length ? <div className="empty-state"><strong>Nenhuma solicitação neste status</strong><span>Somente solicitações registradas e autorizadas aparecerão aqui.</span></div>
          : data.items.map((approval) => (
            <article className="approval-card" key={approval.id} data-approval-id={approval.id}>
              <div className="detail-heading"><div><p className="section-kicker">Solicitação de execução</p>
                <h3>{operations[approval.capabilityKey] ?? approval.capabilityKey}</h3></div>
                <span className={`status status-${approval.status === "PENDING" ? "pending" : approval.status === "APPROVED" ? "completed" : "failed"}`}>{labels[approval.status]}</span>
              </div>
              <p className="muted">{approval.requestedByYou ? "Solicitada por você" : approval.requestedBy.name.trim() ? `Solicitada por ${approval.requestedBy.name}` : `Solicitante ${approval.requestedBy.id}`}
                {` · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(approval.createdAt))}`}</p>
              {approval.review ? <>
                <dl className="facts"><div><dt>Operação</dt><dd>{approval.review.operationId}</dd></div>
                  {approval.review.fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
                </dl>
                {approval.canDecide ? <>
                  <p className="muted">Confira os dados antes de decidir. A aprovação não executa a etapa automaticamente.</p>
                  <div className="toolbar-actions">
                    <button className="primary" type="button" data-decision="APPROVED" disabled={deciding !== null} onClick={() => void decide(approval, "APPROVED")}>Aprovar</button>
                    <button className="secondary logout" type="button" data-decision="REJECTED" disabled={deciding !== null} onClick={() => void decide(approval, "REJECTED")}>Rejeitar</button>
                  </div>
                </> : approval.status === "PENDING" ? <p className="muted">Aguardando decisão de outro usuário autorizado.</p> : null}
                <button className="secondary approval-open" type="button" onClick={() => onOpenRun(approval.review!.workflowRunId)}>Abrir execução</button>
              </> : <p className="alert notice">O contexto desta solicitação não pôde ser verificado. A decisão está indisponível.</p>}
            </article>
          ))}
      </div>
      {data && data.meta.totalPages > 1 ? <div className="toolbar-actions approval-pages">
        <button className="secondary" type="button" disabled={loading || page <= 1 || deciding !== null} onClick={() => setPage(page - 1)}>Anterior</button>
        <span className="muted">Página {page} de {data.meta.totalPages}</span>
        <button className="secondary" type="button" disabled={loading || page >= data.meta.totalPages || deciding !== null} onClick={() => setPage(page + 1)}>Próxima</button>
      </div> : null}
    </section>
  );
}
