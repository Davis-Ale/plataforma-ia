import type { ReactNode } from "react";

export function PortalShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="app-shell">
      <a className="skip-link" href="#execucoes">Ir para as execuções</a>
      <div className="app-grid">
        <aside className="sidebar">
          <p className="sidebar-brand">Plataforma IA</p>
          <nav aria-label="Navegação principal">
            <a className="nav-item active" href="#execucoes" aria-current="page">
              <span className="nav-icon" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="6" height="6" rx="1.5" />
                  <rect x="14" y="14" width="6" height="6" rx="1.5" />
                  <path d="M10 7h5a2 2 0 0 1 2 2v5M7 10v5a2 2 0 0 0 2 2h5" />
                </svg>
              </span>
              <span>Execuções</span>
            </a>
          </nav>
          <p className="sidebar-footer">ADR Solutions</p>
        </aside>
        <section className="app-content" aria-label="Área operacional">{children}</section>
      </div>
    </main>
  );
}
