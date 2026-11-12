"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RequestScope } from "../lib/request-scope";
import { PortalShell } from "../components/portal-shell";
import { WorkflowApprovals } from "../components/workflow-approvals";
import { OperationQuestion } from "../components/operation-question";

type CompanyMembership = {
  id: string;
  status: string;
  role: string;
  company: {
    id: string;
    name: string;
    status: string;
  };
};

type User = {
  id: string;
  name: string;
  email: string;
  companies: CompanyMembership[];
};

type WorkflowStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

type WorkflowListItem = {
  id: string;
  workflowKey: string;
  status: WorkflowStatus;
  operationId: string;
  correlationId: string;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { steps: number };
};

type WorkflowStep = {
  id: string;
  stepKey: string;
  stepOrder: number;
  status: WorkflowStatus;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkflowDetail = Omit<WorkflowListItem, "_count"> & {
  steps: WorkflowStep[];
  execution?: {
    state: "READY" | "RUNNING" | "WAITING" | "FAILED" | "COMPLETED";
    requestedByUserId: string;
    attemptCount: number;
    maxAttempts: number;
    simulated: boolean;
    heartbeatAt: string | null;
    leaseUntil: string | null;
    checkpoints: { workflowStepId: string; state: string; replaySafety: string; attemptCount: number }[];
    incidents: {
      id: string; workflowStepId: string | null; code: string; attemptNumber: number; createdAt: string;
      resolvedAt: string | null; reconciledAt: string | null; reconciliationOutcome: "APPLIED" | "NOT_APPLIED" | null;
    }[];
  } | null;
};

type WorkflowListResponse = {
  items: WorkflowListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const statusLabel: Record<WorkflowStatus, string> = {
  PENDING: "Pendente",
  RUNNING: "Em execução",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

function workflowLabel(key: string) {
  return key === "operations.prepare_from_contract" ? "Preparação de operação" : key;
}

function stepLabel(key: string) {
  const labels: Record<string, string> = {
    read_contract: "Consultar contrato",
    plan_operations: "Planejar operação",
    check_capacity: "Verificar capacidade",
  };
  return labels[key] ?? key;
}

function executionStatus(run: { status: WorkflowStatus; error: string | null }) {
  if (run.status === "FAILED" && run.error === "APPROVAL_REQUIRED") return { label: "Aguardando aprovação", className: "status-pending" };
  if (run.status === "FAILED" && run.error === "APPROVAL_REJECTED") return { label: "Rejeitada", className: "status-failed" };
  return { label: statusLabel[run.status], className: `status-${run.status.toLowerCase()}` };
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function recoveryMessage(code: string) {
  const messages: Record<string, string> = {
    EXECUTION_FAILED: "A etapa falhou; o efeito da tentativa precisa ser verificado.",
    EXECUTION_INTERRUPTED: "A execução perdeu o sinal de atividade.",
    EXECUTION_IN_PROGRESS: "Já existe uma tentativa em andamento.",
    RECONCILIATION_REQUIRED: "Resultado externo desconhecido. Confira o efeito antes de retomar.",
    APPROVAL_REQUIRED: "A execução aguarda aprovação humana.",
    APPROVAL_REJECTED: "A solicitação foi rejeitada. Esta execução não pode ser retomada com essa decisão.",
    ATTEMPT_LIMIT: "O limite de tentativas foi atingido.",
    DENIED: "A autorização atual não permite esta execução.",
    CHECKPOINT_ACCESS_DENIED: "O acesso atual não permite reutilizar uma etapa concluída.",
    INTEGRATION_UNAVAILABLE: "A integração está indisponível ou sua configuração mudou.",
    INVALID_INPUT: "Os dados da etapa não são válidos.",
    CANCELLED: "A execução está cancelada.",
  };
  return messages[code] ?? "A execução requer revisão.";
}

function duration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) {
    return "—";
  }
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const milliseconds = Math.max(0, end - start);
  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }
  if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(1)} s`;
  }
  return `${Math.floor(milliseconds / 60000)} min ${Math.floor((milliseconds % 60000) / 1000)} s`;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<"executions" | "approvals">("executions");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [selected, setSelected] = useState<WorkflowDetail | null>(null);
  const [status, setStatus] = useState<WorkflowStatus | "">("");
  const [operationDraft, setOperationDraft] = useState("");
  const [operationId, setOperationId] = useState("");
  const [contractReference, setContractReference] = useState("");
  const [startingOperation, setStartingOperation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const sessionRequests = useRef(new RequestScope());
  const workflowRequests = useRef(new RequestScope());
  const detailRequests = useRef(new RequestScope());
  const actionRequests = useRef(new RequestScope());
  const startRequests = useRef(new RequestScope());
  const pendingOperations = useRef(new Map<string, string>());
  const [actionLoading, setActionLoading] = useState(false);

  const activeCompanies = useMemo(
    () => user?.companies.filter(
      (membership) => membership.status === "ACTIVE" && membership.company.status === "ACTIVE",
    ) ?? [],
    [user],
  );

  const resetSession = useCallback(() => {
    sessionRequests.current.cancel();
    workflowRequests.current.cancel();
    detailRequests.current.cancel();
    actionRequests.current.cancel();
    startRequests.current.cancel();
    pendingOperations.current.clear();
    setContractReference("");
    setStartingOperation(false);
    setActionLoading(false);
    setUser(null);
    setView("executions");
    setCompanyId("");
    setWorkflows([]);
    setSelected(null);
    setStatus("");
    setOperationDraft("");
    setOperationId("");
    setWorkflowsLoading(false);
    setDetailLoading(false);
    setLoading(false);
  }, []);

  const loadWorkflows = useCallback(async (currentCompanyId: string, currentStatus = "", currentOperationId = "") => {
    actionRequests.current.cancel();
    setActionLoading(false);
    const pending = workflowRequests.current.start();
    detailRequests.current.cancel();
    setWorkflows([]);
    setSelected(null);
    setDetailLoading(false);
    if (!currentCompanyId) {
      setWorkflowsLoading(false);
      return;
    }
    setWorkflowsLoading(true);
    setMessage("");
    const params = new URLSearchParams({ companyId: currentCompanyId });
    if (currentStatus) {
      params.set("status", currentStatus);
    }
    if (currentOperationId) {
      params.set("operationId", currentOperationId);
    }
    try {
      const response = await fetch(`/api/workflows?${params.toString()}`, {
        cache: "no-store", signal: pending.signal,
      });
      if (!pending.isCurrent()) return;
      if (response.status === 401) {
        resetSession();
        return;
      }
      const data = await response.json() as WorkflowListResponse | { message?: string };
      if (!pending.isCurrent()) return;
      if (!response.ok || !("items" in data)) {
        setMessage("Não foi possível carregar as execuções.");
        return;
      }
      setWorkflows(data.items);
    } catch {
      if (!pending.isCurrent()) return;
      setMessage("API indisponível. Verifique a conexão com a plataforma.");
    } finally {
      if (pending.isCurrent()) setWorkflowsLoading(false);
    }
  }, [resetSession]);

  const loadDetail = useCallback(async (id: string, currentCompanyId = companyId) => {
    actionRequests.current.cancel();
    setActionLoading(false);
    const pending = detailRequests.current.start();
    setSelected(null);
    if (!currentCompanyId) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/workflows/${encodeURIComponent(id)}?companyId=${encodeURIComponent(currentCompanyId)}`, {
        cache: "no-store", signal: pending.signal,
      });
      if (!pending.isCurrent()) return;
      if (response.status === 401) {
        resetSession();
        return;
      }
      if (!response.ok) {
        setMessage("Não foi possível carregar os detalhes da execução.");
        return;
      }
      const data = await response.json() as WorkflowDetail;
      if (pending.isCurrent()) setSelected(data);
    } catch {
      if (!pending.isCurrent()) return;
      setMessage("API indisponível. Verifique a conexão com a plataforma.");
    } finally {
      if (pending.isCurrent()) setDetailLoading(false);
    }
  }, [companyId, resetSession]);

  useEffect(() => {
    const sessions = sessionRequests.current;
    const workflows = workflowRequests.current;
    const details = detailRequests.current;
    const starts = startRequests.current;
    const pending = sessions.start();
    const bootstrap = async () => {
      try {
        const response = await fetch("/api/session/me", {
          cache: "no-store", signal: pending.signal,
        });
        if (!pending.isCurrent()) return;
        if (!response.ok) {
          return;
        }
        const currentUser = await response.json() as User;
        if (!pending.isCurrent()) return;
        setUser(currentUser);
        const firstCompany = currentUser.companies.find(
          (membership) => membership.status === "ACTIVE" && membership.company.status === "ACTIVE",
        );
        if (firstCompany) {
          setCompanyId(firstCompany.company.id);
          await loadWorkflows(firstCompany.company.id, "");
        }
      } catch {
        if (!pending.isCurrent()) return;
        setMessage("API indisponível. Verifique a conexão com a plataforma.");
      } finally {
        if (pending.isCurrent()) setLoading(false);
      }
    };
    void bootstrap();
    return () => {
      sessions.cancel();
      workflows.cancel();
      details.cancel();
      starts.cancel();
      actionRequests.current.cancel();
    };
  }, [loadWorkflows]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pending = sessionRequests.current.start();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: pending.signal,
      });
      const data = await response.json() as { user?: User };
      if (!pending.isCurrent()) return;
      if (response.status === 429) {
        setMessage("Muitas tentativas de login. Aguarde um minuto e tente novamente.");
        return;
      }
      if (response.status === 503) {
        setMessage("Login temporariamente indisponível. Tente novamente em instantes.");
        return;
      }
      if (!response.ok || !data.user) {
        setMessage("E-mail ou senha inválidos.");
        return;
      }
      setUser(data.user);
      setPassword("");
      const firstCompany = data.user.companies.find(
        (membership) => membership.status === "ACTIVE" && membership.company.status === "ACTIVE",
      );
      if (firstCompany) {
        setCompanyId(firstCompany.company.id);
        await loadWorkflows(firstCompany.company.id, "");
      }
    } catch {
      if (!pending.isCurrent()) return;
      setMessage("API indisponível. Verifique a conexão com a plataforma.");
    } finally {
      if (pending.isCurrent()) setLoading(false);
    }
  }

  async function logout() {
    actionRequests.current.cancel();
    startRequests.current.cancel();
    setStartingOperation(false);
    setActionLoading(false);
    const pending = sessionRequests.current.start();
    workflowRequests.current.cancel();
    detailRequests.current.cancel();
    setWorkflows([]);
    setSelected(null);
    setWorkflowsLoading(false);
    setDetailLoading(false);
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/session/logout", {
        method: "POST", signal: pending.signal,
      });
      if (!pending.isCurrent()) return;
      if (!response.ok) {
        setMessage("Não foi possível encerrar a sessão. Tente novamente.");
        return;
      }
      resetSession();
    } catch {
      if (pending.isCurrent()) setMessage("Não foi possível encerrar a sessão. Tente novamente.");
    } finally {
      if (pending.isCurrent()) setLoading(false);
    }
  }

  async function changeCompany(nextCompanyId: string) {
    startRequests.current.cancel();
    setContractReference("");
    setStartingOperation(false);
    setCompanyId(nextCompanyId);
    setOperationDraft("");
    setOperationId("");
    setSelected(null);
    await loadWorkflows(nextCompanyId, status);
  }

  async function changeStatus(nextStatus: WorkflowStatus | "") {
    setStatus(nextStatus);
    setSelected(null);
    await loadWorkflows(companyId, nextStatus, operationId);
  }

  async function searchOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextOperationId = operationDraft.trim();
    setOperationId(nextOperationId);
    await loadWorkflows(companyId, status, nextOperationId);
  }

  async function startOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reference = contractReference.trim();
    if (!companyId || !reference || startingOperation) return;
    const pending = startRequests.current.start();
    const currentCompanyId = companyId;
    const requestKey = JSON.stringify([currentCompanyId, reference]);
    setStartingOperation(true);
    setMessage("");
    try {
      let id = pendingOperations.current.get(requestKey);
      if (!id) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
        pendingOperations.current.set(requestKey, id);
      }
      const response = await fetch(`/api/operations/start?companyId=${encodeURIComponent(currentCompanyId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: pending.signal,
        body: JSON.stringify({ contractExternalRef: reference, operationId: id }),
      });
      if (!pending.isCurrent()) return;
      if (response.status === 401) { resetSession(); return; }
      if (!response.ok) {
        setMessage(response.status === 403 ? "Seu acesso não permite iniciar esta operação." : "Não foi possível iniciar a operação. Tente novamente.");
        return;
      }
      const result = await response.json() as { workflowRunId?: string; error?: string };
      if (!pending.isCurrent()) return;
      if (!result.workflowRunId) {
        setMessage(result.error ? recoveryMessage(result.error) : "Não foi possível localizar a execução.");
        return;
      }
      pendingOperations.current.delete(requestKey);
      setContractReference("");
      setStatus("");
      setOperationId(id);
      setOperationDraft(id);
      await loadWorkflows(currentCompanyId, "", id);
      if (pending.isCurrent()) await loadDetail(result.workflowRunId, currentCompanyId);
    } catch {
      if (pending.isCurrent()) setMessage("A conexão foi interrompida. Tente novamente com a mesma referência.");
    } finally {
      if (pending.isCurrent()) setStartingOperation(false);
    }
  }

  async function executionAction(action: "inspect" | "resume" | "reconcile", decision?: {
    incidentId: string; outcome: FormDataEntryValue | null; evidenceReference: FormDataEntryValue | null;
  }) {
    if (!selected || actionLoading) return;
    const pending = actionRequests.current.start();
    const runId = selected.id;
    const currentCompanyId = companyId;
    setActionLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/workflows/${encodeURIComponent(runId)}/${action}?companyId=${encodeURIComponent(currentCompanyId)}`, {
        method: "POST", signal: pending.signal,
        ...(decision ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision) } : {}),
      });
      if (!pending.isCurrent()) return;
      if (response.status === 401) { resetSession(); return; }
      const data = await response.json() as { success?: boolean; error?: string };
      if (!pending.isCurrent()) return;
      if (!response.ok) { setMessage("Não foi possível processar a execução. Atualize os detalhes e confira seu acesso."); return; }
      const detail = await fetch(`/api/workflows/${encodeURIComponent(runId)}?companyId=${encodeURIComponent(currentCompanyId)}`, { cache: "no-store", signal: pending.signal });
      if (!pending.isCurrent()) return;
      if (detail.status === 401) { resetSession(); return; }
      if (!detail.ok) { setMessage("A ação foi processada. Atualize para consultar o resultado persistido."); return; }
      const updated = await detail.json() as WorkflowDetail;
      if (!pending.isCurrent()) return;
      setSelected(updated);
      setWorkflows((items) => items.map((item) => item.id === updated.id ? { ...item, status: updated.status, error: updated.error, completedAt: updated.completedAt } : item)
        .filter((item) => !status || item.status === status));
      if (data.success === false) setMessage(recoveryMessage(data.error ?? ""));
    } catch {
      if (pending.isCurrent()) setMessage("A conexão foi interrompida. Atualize antes de tentar novamente.");
    } finally {
      if (pending.isCurrent()) setActionLoading(false);
    }
  }

  const activeRole = activeCompanies.find((membership) => membership.company.id === companyId)?.role;
  const canReconcile = activeRole === "OWNER" || activeRole === "ADMIN";
  const execution = selected?.execution;
  const uncertainSteps = execution?.checkpoints.filter((item) => item.state === "UNKNOWN" && item.replaySafety === "MANUAL") ?? [];
  const pendingIncident = execution?.incidents.find((incident) =>
    incident.attemptNumber === execution.attemptCount && !incident.resolvedAt && !incident.reconciledAt &&
    uncertainSteps.some((step) => step.workflowStepId === incident.workflowStepId));

  if (loading && !user) {
    return <main className="center-state">Carregando plataforma…</main>;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <p className="eyebrow">Plataforma IA</p>
          <h1>Entrar</h1>
          
          <form onSubmit={login}>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>
            {message ? <p className="error-message">{message}</p> : null}
            <button type="submit" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <PortalShell view={view} onNavigate={setView}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Empresa ativa</p>
          <h1>{activeCompanies.find((membership) => membership.company.id === companyId)?.company.name ?? "Sem empresa ativa"}</h1>
        </div>
        <div className="topbar-actions">
          {activeCompanies.length > 1 ? (
            <select value={companyId} disabled={loading} onChange={(event: ChangeEvent<HTMLSelectElement>) => void changeCompany(event.target.value)} aria-label="Empresa">
              {activeCompanies.map((membership) => (
                <option key={membership.company.id} value={membership.company.id}>
                  {membership.company.name}
                </option>
              ))}
            </select>
          ) : activeCompanies.length === 1 ? (
            <span className="company-name">{activeCompanies[0]?.company.name ?? "Sem empresa ativa"}</span>
          ) : null}
          {user.name.trim() ? <span className="user-name">{user.name}</span> : null}
          <button className="secondary logout" type="button" disabled={loading} onClick={() => void logout()}>Sair</button>
        </div>
      </header>

      {view === "approvals" ? <WorkflowApprovals key={companyId} companyId={companyId} onSessionExpired={resetSession}
        onOpenRun={(id) => { setView("executions"); void loadDetail(id); }} /> : <>
      <section className="toolbar" id="execucoes" tabIndex={-1}>
        <div>
          <p className="section-kicker">Visão operacional</p>
          <h2>Execuções</h2>
        </div>
        <div className="toolbar-actions">
          <form className="operation-search" onSubmit={(event) => void searchOperation(event)}>
            <input type="search" aria-label="Identificador da operação" placeholder="Identificador da operação"
              maxLength={255} value={operationDraft} onChange={(event) => setOperationDraft(event.target.value)}
              disabled={loading || !companyId} />
            <button className="secondary" type="submit" disabled={loading || !companyId}>Buscar</button>
          </form>
          <select value={status} disabled={loading || !companyId} onChange={(event: ChangeEvent<HTMLSelectElement>) => void changeStatus(event.target.value as WorkflowStatus | "")} aria-label="Filtrar por status">
            <option value="">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="RUNNING">Em execução</option>
            <option value="COMPLETED">Concluídas</option>
            <option value="FAILED">Falhas e bloqueios</option>
            <option value="CANCELLED">Canceladas</option>
          </select>
          <button className="secondary" type="button" disabled={loading || !companyId} onClick={() => void loadWorkflows(companyId, status, operationId)}>Atualizar</button>
        </div>
      </section>

      <form className="toolbar-actions operation-start" aria-label="Nova operação" onSubmit={(event) => void startOperation(event)}>
        <label htmlFor="operation-contract">Referência do contrato</label>
        <input id="operation-contract" value={contractReference} onChange={(event) => setContractReference(event.target.value)}
          maxLength={255} required disabled={loading || !companyId || startingOperation} />
        <button className="primary" type="submit" disabled={loading || !companyId || !contractReference.trim() || startingOperation}>
          {startingOperation ? "Iniciando…" : "Iniciar operação"}
        </button>
      </form>

      {message ? <div className="alert">{message}</div> : null}

      <div className="workspace">
        <section className="run-list" aria-label="Execuções" aria-busy={workflowsLoading}>
          {workflowsLoading ? (
            <div className="empty-state" role="status">Carregando execuções…</div>
          ) : !companyId ? (
            <div className="empty-state"><strong>Nenhuma empresa ativa</strong></div>
          ) : workflows.length === 0 ? (
            <div className="empty-state">
              <strong>{operationId ? "Nenhuma execução encontrada para esta operação" : "Nenhuma execução registrada"}</strong>
              <span>{operationId ? "Confira o identificador e os filtros da empresa ativa." : "As execuções registradas para esta empresa aparecerão aqui."}</span>
            </div>
          ) : workflows.map((run) => (
            <button
              type="button"
              className={`run-row ${selected?.id === run.id ? "selected" : ""}`}
              key={run.id}
              data-workflow-key={run.workflowKey}
              onClick={() => void loadDetail(run.id)}
            >
              <div className="run-main">
                <span className={`status ${executionStatus(run).className}`}>{executionStatus(run).label}</span>
                <strong>{workflowLabel(run.workflowKey)}</strong>
                <span className="muted">Operação {run.operationId}</span>
              </div>
              <div className="run-meta">
                <span>{run._count.steps} etapas</span>
                <span>{formatDate(run.createdAt)}</span>
              </div>
            </button>
          ))}
        </section>

        <aside className="detail-panel" aria-live="polite" aria-busy={detailLoading}>
          {detailLoading ? (
            <div className="empty-state compact" role="status">Carregando execução…</div>
          ) : !selected ? (
            <div className="empty-state compact">
              <strong>Selecione uma execução</strong>
              <span>Os detalhes persistidos do workflow serão exibidos aqui.</span>
            </div>
          ) : (
            <>
              <div className="detail-heading">
                <div>
                  <p className="section-kicker">Execução</p>
                  <h2>{workflowLabel(selected.workflowKey)}</h2>
                </div>
                <span className={`status ${executionStatus(selected).className}`}>{executionStatus(selected).label}</span>
              </div>

              <dl className="facts">
                <div><dt>Operation ID</dt><dd>{selected.operationId}</dd></div>
                <div><dt>Correlation ID</dt><dd>{selected.correlationId}</dd></div>
                <div><dt>Início</dt><dd>{formatDate(selected.startedAt)}</dd></div>
                <div><dt>Fim</dt><dd>{formatDate(selected.completedAt)}</dd></div>
                <div><dt>Duração</dt><dd>{duration(selected.startedAt, selected.completedAt)}</dd></div>
              </dl>

              {selected.error ? <div className="error-block">{selected.execution ? recoveryMessage(selected.error) : selected.error}</div> : null}

              <OperationQuestion key={`${companyId}:${selected.id}`} companyId={companyId} runId={selected.id}
                describeStatus={(answer) => executionStatus(answer).label} onSessionExpired={resetSession} />

              {selected.execution ? (
                <section aria-label="Integridade da execução">
                  <p className="section-kicker">Integridade da execução</p>
                  {selected.execution.simulated ? <p className="alert notice">Demonstração com adaptador simulado. Não comprova integração com sistema externo.</p> : null}
                  <dl className="facts">
                    <div><dt>Tentativas</dt><dd>{selected.execution.attemptCount} de {selected.execution.maxAttempts}</dd></div>
                    <div><dt>Último sinal de atividade</dt><dd>{formatDate(selected.execution.heartbeatAt)}</dd></div>
                    <div><dt>Validade da execução ativa</dt><dd>{formatDate(selected.execution.leaseUntil)}</dd></div>
                  </dl>
                  {uncertainSteps.length ? (
                    <p className="error-block">{selected.execution.incidents.some((incident) =>
                      incident.attemptNumber === selected.execution?.attemptCount && incident.reconciliationOutcome === "APPLIED")
                      ? "A ação já ocorreu no sistema externo. A etapa permanece bloqueada para evitar duplicação."
                      : "Resultado externo desconhecido. Confira o efeito no sistema de origem antes de retomar."}</p>
                  ) : null}
                  {canReconcile && pendingIncident && selected.execution.state === "FAILED" && selected.status === "FAILED" ? (
                    <form key={pendingIncident.id} className="reconciliation-form" onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void executionAction("reconcile", {
                        incidentId: pendingIncident.id, outcome: form.get("outcome"), evidenceReference: form.get("evidenceReference"),
                      });
                    }}>
                      <label>
                        Resultado confirmado no sistema externo
                        <select name="outcome" defaultValue="" required disabled={actionLoading}>
                          <option value="" disabled>Selecione o resultado</option>
                          <option value="APPLIED">A ação ocorreu</option>
                          <option value="NOT_APPLIED">A ação não ocorreu e não está pendente</option>
                        </select>
                      </label>
                      <label>
                        Referência da conferência
                        <input name="evidenceReference" required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,79}" disabled={actionLoading} />
                      </label>
                      <button className="secondary" type="submit" disabled={actionLoading}>Registrar conferência</button>
                    </form>
                  ) : null}
                  {selected.execution.requestedByUserId === user.id && selected.status !== "CANCELLED" && selected.execution.state !== "COMPLETED" && selected.error !== "APPROVAL_REJECTED" ? (
                    <div className="toolbar-actions">
                      <button className="secondary" type="button" disabled={actionLoading} onClick={() => void executionAction("inspect")}>Verificar interrupção</button>
                      {selected.execution.state !== "RUNNING" && selected.execution.attemptCount < selected.execution.maxAttempts &&
                        !uncertainSteps.length ? (
                        <button className="primary" type="button" disabled={actionLoading} onClick={() => void executionAction("resume")}>{actionLoading ? "Processando…" : "Retomar execução"}</button>
                      ) : null}
                    </div>
                  ) : null}
                  {selected.execution.incidents.map((incident) => (
                    <p key={incident.id} className={incident.resolvedAt ? "muted" : "error-block"}>
                      Tentativa {incident.attemptNumber}: {recoveryMessage(incident.code)} · {formatDate(incident.createdAt)}{incident.resolvedAt ? " · Resolvido" : ""}
                      {incident.reconciledAt ? ` · Conferido em ${formatDate(incident.reconciledAt)}` : ""}
                    </p>
                  ))}
                </section>
              ) : null}

              <div className="steps-heading">
                <p className="section-kicker">Etapas persistidas</p>
                <span>{selected.steps.length}</span>
              </div>
              <ol className="steps">
                {selected.steps.map((step) => (
                  <li key={step.id}>
                    <div className="step-order">{step.stepOrder}</div>
                    <div className="step-body">
                      <div className="step-title">
                        <strong>{stepLabel(step.stepKey)}</strong>
                        <span className={`status ${executionStatus(step).className}`}>{executionStatus(step).label}</span>
                      </div>
                      <div className="step-time">
                        <span>{formatDate(step.startedAt)}</span>
                        <span>{duration(step.startedAt, step.completedAt)}</span>
                      </div>
                      {step.error ? <div className="step-error">{selected.execution ? recoveryMessage(step.error) : step.error}</div> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </aside>
      </div>
      </>}
    </PortalShell>
  );
}
