"use client";

import { useState, type FormEvent } from "react";

import type { AgentQueryResponse, AgentSource } from "@/lib/agent/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: AgentQueryResponse };

const DEFAULT_SUGGESTIONS = [
  "¿Qué requisitos establece la circular sobre el trámite?",
  "Resume las obligaciones principales de la norma.",
  "¿Qué plazos o vigencias mencionan los documentos publicados?",
];

export function AgentConsole({
  suggestions = DEFAULT_SUGGESTIONS,
  intro = "La respuesta usa recuperación semántica sobre los fragmentos autorizados y cita cada fuente. Si la evidencia no alcanza, el asistente se abstiene.",
}: {
  suggestions?: string[];
  intro?: string;
}) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function ask(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setState({ status: "error", message: "Escribe una pregunta más específica." });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch("/api/agent/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AgentQueryResponse & { error?: { message?: string } })
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        setState({
          status: "error",
          message:
            (payload as { error?: { message?: string } } | null)?.error?.message ??
            "No fue posible consultar la biblioteca documental.",
        });
        return;
      }

      setState({ status: "success", data: payload as AgentQueryResponse });
    } catch {
      setState({
        status: "error",
        message: "No fue posible conectar con el servicio de consulta.",
      });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section className="agent-panel" aria-labelledby="agent-heading">
      <div className="agent-panel-head">
        <div>
          <p className="admin-eyebrow">Asistente documental</p>
          <h2 id="agent-heading">Consulta las normas publicadas</h2>
        </div>
        <span className="agent-scope">Solo documentos aprobados y publicados</span>
      </div>

      <p className="agent-intro">{intro}</p>

      <form className="agent-form" onSubmit={onSubmit}>
        <label className="agent-label" htmlFor="agent-question">
          Pregunta
        </label>
        <div className="agent-input-row">
          <textarea
            id="agent-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ej. ¿Qué obligaciones establece la circular para las entidades?"
            rows={3}
            maxLength={1200}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void ask(question);
              }
            }}
          />
          <button type="submit" disabled={state.status === "loading"}>
            {state.status === "loading" ? "Consultando..." : "Consultar"}
          </button>
        </div>
        <small className="agent-help">
          Enter para una nueva línea. Ctrl/⌘ + Enter para consultar.
        </small>
      </form>

      {state.status === "idle" ? (
        <div className="agent-suggestions">
          <span>Sugerencias</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setQuestion(suggestion);
                void ask(suggestion);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="agent-loading" role="status">
          Buscando fragmentos autorizados y redactando la respuesta...
        </div>
      ) : null}

      {state.status === "error" ? (
        <p className="admin-message admin-message-error" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? <Answer data={state.data} /> : null}
    </section>
  );
}

function Answer({ data }: { data: AgentQueryResponse }) {
  const tag =
    data.outcome === "answered"
      ? { className: "agent-tag", label: "Respuesta con fuentes" }
      : data.outcome === "blocked"
        ? { className: "agent-tag agent-tag-warn", label: "Solicitud bloqueada" }
        : data.outcome === "rejected"
          ? { className: "agent-tag agent-tag-warn", label: "Consulta rechazada" }
          : data.outcome === "out_of_scope"
            ? { className: "agent-tag agent-tag-warn", label: "Fuera de alcance" }
            : { className: "agent-tag agent-tag-warn", label: "Sin evidencia suficiente" };

  return (
    <div className="agent-answer" aria-live="polite">
      <div className="agent-answer-head">
        <span className={tag.className}>{tag.label}</span>
        <span className="agent-meta">
          {data.sources.length} fuente{data.sources.length === 1 ? "" : "s"} ·{" "}
          {Math.round(data.latencyMs / 100) / 10}s
        </span>
      </div>

      <div className="agent-answer-text">{renderAnswer(data.answer, data.sources)}</div>

      {data.sources.length ? (
        <div className="agent-sources">
          <h3>Fuentes</h3>
          <ol>
            {data.sources.map((source) => (
              <li
                key={source.chunk_id}
                id={`agent-source-${source.rank}`}
                value={source.rank}
              >
                <div className="agent-source-head">
                  <strong>{source.title}</strong>
                  <span className="agent-meta">
                    v{source.version} · {source.page ? `p. ${source.page}` : "sin página"}
                    {source.article ? ` · art. ${source.article}` : ""}
                    {source.numeral ? ` · num. ${source.numeral}` : ""}
                  </span>
                </div>
                <p>{source.excerpt}</p>
                <span className="agent-score">
                  similitud {Math.round(source.similarity * 100)}%
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {!data.auditSaved ? (
        <p className="admin-message admin-message-error" role="status">
          La respuesta se generó, pero no se pudo guardar la traza de auditoría.
        </p>
      ) : null}
    </div>
  );
}

function renderAnswer(answer: string, sources: AgentSource[]) {
  const parts = answer.split(/(\[\d{1,2}\])/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[(\d{1,2})\]$/);
    if (!match) return <span key={index}>{part}</span>;

    const rank = Number(match[1]);
    const exists = sources.some((source) => source.rank === rank);
    if (!exists) {
      return (
        <span key={index} className="agent-citation agent-citation-invalid">
          [?]
        </span>
      );
    }

    return (
      <a
        key={index}
        className="agent-citation"
        href={`#agent-source-${rank}`}
        aria-label={`Ir a la fuente ${rank}`}
      >
        [{rank}]
      </a>
    );
  });
}
