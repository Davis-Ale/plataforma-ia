import type { ReactNode } from "react";

export function PortalShell({ children, view, onNavigate }: Readonly<{ children: ReactNode;
  view: "executions" | "approvals"; onNavigate: (view: "executions" | "approvals") => void }>) {
  return (
    <main className="app-shell">
      <a className="skip-link" href={view === "executions" ? "#execucoes" : "#aprovacoes"}>Ir para o conteúdo</a>
      <div className="app-grid">
        <aside className="sidebar">
          <p className="sidebar-brand">Plataforma IA</p>
          <nav aria-label="Navegação principal">
            <button className={`nav-item ${view === "executions" ? "active" : ""}`} type="button" onClick={() => onNavigate("executions")} aria-current={view === "executions" ? "page" : undefined}>
              <span className="nav-icon" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="6" height="6" rx="1.5" />
                  <rect x="14" y="14" width="6" height="6" rx="1.5" />
                  <path d="M10 7h5a2 2 0 0 1 2 2v5M7 10v5a2 2 0 0 0 2 2h5" />
                </svg>
              </span>
              <span>Execuções</span>
            </button>
            <button className={`nav-item ${view === "approvals" ? "active" : ""}`} type="button" onClick={() => onNavigate("approvals")} aria-current={view === "approvals" ? "page" : undefined}>
              <span className="nav-icon" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8v3H8zM7 5H5v15h14V5h-2M8 13l3 3 5-6" /></svg></span>
              <span>Aprovações</span>
            </button>
          </nav>
          <p className="sidebar-footer">ADR Solutions</p>
        </aside>
        <section className="app-content" aria-label="Área operacional">{children}</section>
      </div>
    </main>
  );
}
