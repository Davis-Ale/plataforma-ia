"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RequestScope } from "../lib/request-scope";

type CompanyMembership = {
  id: string;
  status: string;
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

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [selected, setSelected] = useState<WorkflowDetail | null>(null);
  const [status, setStatus] = useState<WorkflowStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const sessionRequests = useRef(new RequestScope());
  const workflowRequests = useRef(new RequestScope());
  const detailRequests = useRef(new RequestScope());

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
    setUser(null);
    setCompanyId("");
    setWorkflows([]);
    setSelected(null);
    setStatus("");
    setWorkflowsLoading(false);
    setDetailLoading(false);
    setLoading(false);
  }, []);

  const loadWorkflows = useCallback(async (currentCompanyId: string, currentStatus = "") => {
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
    setCompanyId(nextCompanyId);
    setSelected(null);
    await loadWorkflows(nextCompanyId, status);
  }

  async function changeStatus(nextStatus: WorkflowStatus | "") {
    setStatus(nextStatus);
    setSelected(null);
    await loadWorkflows(companyId, nextStatus);
  }

  if (loading && !user) {
    return <main className="center-state">Carregando plataforma…</main>;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="brand-mark">IA</div>
          <p className="eyebrow">ADR Solutions</p>
          <h1>Plataforma IA</h1>
          
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
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Plataforma IA</p>
          <h1>Visão operacional</h1>
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
          ) : (
            <span className="company-name">{activeCompanies[0]?.company.name ?? "Sem empresa ativa"}</span>
          )}
          <span className="user-name">{user.name}</span>
          <button className="secondary" type="button" disabled={loading} onClick={() => void logout()}>Sair</button>
        </div>
      </header>

      <section className="toolbar">
        <div>
          <p className="section-kicker">Execução real</p>
          <h2>Workflows</h2>
        </div>
        <div className="toolbar-actions">
          <select value={status} disabled={loading || !companyId} onChange={(event: ChangeEvent<HTMLSelectElement>) => void changeStatus(event.target.value as WorkflowStatus | "")} aria-label="Filtrar por status">
            <option value="">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="RUNNING">Em execução</option>
            <option value="COMPLETED">Concluídas</option>
            <option value="FAILED">Falhas</option>
            <option value="CANCELLED">Canceladas</option>
          </select>
          <button className="secondary" type="button" disabled={loading || !companyId} onClick={() => void loadWorkflows(companyId, status)}>Atualizar</button>
        </div>
      </section>

      {message ? <div className="alert">{message}</div> : null}

      <div className="workspace">
        <section className="run-list" aria-label="Execuções" aria-busy={workflowsLoading}>
          {workflowsLoading ? (
            <div className="empty-state" role="status">Carregando execuções…</div>
          ) : !companyId ? (
            <div className="empty-state"><strong>Nenhuma empresa ativa</strong></div>
          ) : workflows.length === 0 ? (
            <div className="empty-state">
              <strong>Nenhuma execução registrada</strong>
              <span>Quando um workflow real for executado, ele aparecerá aqui.</span>
            </div>
          ) : workflows.map((run) => (
            <button
              type="button"
              className={`run-row ${selected?.id === run.id ? "selected" : ""}`}
              key={run.id}
              onClick={() => void loadDetail(run.id)}
            >
              <div className="run-main">
                <span className={`status status-${run.status.toLowerCase()}`}>{statusLabel[run.status]}</span>
                <strong>{run.workflowKey}</strong>
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
                  <h2>{selected.workflowKey}</h2>
                </div>
                <span className={`status status-${selected.status.toLowerCase()}`}>{statusLabel[selected.status]}</span>
              </div>

              <dl className="facts">
                <div><dt>Operation ID</dt><dd>{selected.operationId}</dd></div>
                <div><dt>Correlation ID</dt><dd>{selected.correlationId}</dd></div>
                <div><dt>Início</dt><dd>{formatDate(selected.startedAt)}</dd></div>
                <div><dt>Fim</dt><dd>{formatDate(selected.completedAt)}</dd></div>
                <div><dt>Duração</dt><dd>{duration(selected.startedAt, selected.completedAt)}</dd></div>
              </dl>

              {selected.error ? <div className="error-block">{selected.error}</div> : null}

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
                        <strong>{step.stepKey}</strong>
                        <span className={`status status-${step.status.toLowerCase()}`}>{statusLabel[step.status]}</span>
                      </div>
                      <div className="step-time">
                        <span>{formatDate(step.startedAt)}</span>
                        <span>{duration(step.startedAt, step.completedAt)}</span>
                      </div>
                      {step.error ? <div className="step-error">{step.error}</div> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
