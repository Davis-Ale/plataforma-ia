"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { RequestScope } from "../lib/request-scope";

type Answer = {
  success: true;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  error: string | null;
  updatedAt: string;
};

type Props = {
  companyId: string;
  runId: string;
  describeStatus: (answer: Answer) => string;
  onSessionExpired: () => void;
};

export function OperationQuestion({ companyId, runId, describeStatus, onSessionExpired }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const requests = useRef(new RequestScope());

  useEffect(() => {
    const scope = requests.current;
    return () => scope.cancel();
  }, []);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || loading) return;
    const pending = requests.current.start();
    setLoading(true);
    setAnswer(null);
    setMessage("");
    try {
      const params = new URLSearchParams({ companyId });
      const response = await fetch(`/api/workflows/${encodeURIComponent(runId)}/question?${params}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }), signal: pending.signal,
      });
      if (!pending.isCurrent()) return;
      if (response.status === 401) return onSessionExpired();
      if (!response.ok) throw new Error("Question failed");
      const result = await response.json() as Answer | { success: false; error: string };
      if (!pending.isCurrent()) return;
      if (result.success) setAnswer(result);
      else if (result.error === "UNSUPPORTED_QUESTION") setMessage("Faça uma pergunta sobre o status desta operação.");
      else if (result.error === "POLICY_UNAVAILABLE" || result.error === "PROVIDER_UNAVAILABLE") setMessage("A consulta com IA ainda não está habilitada para esta empresa.");
      else if (result.error === "BUDGET_DENIED") setMessage("A consulta com IA está bloqueada pela política de consumo da empresa.");
      else setMessage("Não foi possível consultar com IA agora. O status segue disponível nos detalhes da execução.");
    } catch {
      if (pending.isCurrent()) setMessage("Não foi possível consultar esta operação com IA.");
    } finally {
      if (pending.isCurrent()) setLoading(false);
    }
  }

  return (
    <section aria-label="Perguntar sobre a operação">
      <p className="section-kicker">Perguntar sobre a operação</p>
      <form className="operation-search" onSubmit={(event) => void ask(event)}>
        <input aria-label="Pergunta sobre o status" placeholder="Em que situação está esta operação?"
          value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={300} required disabled={loading} />
        <button className="secondary" type="submit" disabled={loading || !question.trim()}>
          {loading ? "Consultando…" : "Perguntar à IA"}
        </button>
      </form>
      {message ? <p role="status" className="muted">{message}</p> : null}
      {answer ? <p role="status">Status registrado: <strong>{describeStatus(answer)}</strong> · Atualizado em {new Date(answer.updatedAt).toLocaleString("pt-BR")}</p> : null}
    </section>
  );
}
