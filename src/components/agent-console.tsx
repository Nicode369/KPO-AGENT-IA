"use client";

import { useState, type FormEvent } from "react";

import { OUTCOME_TONES } from "@/lib/agent/labels";
import type { AgentQueryResponse } from "@/lib/agent/types";

import { RichAnswer } from "./rich-answer";

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

export type SuggestionGroup = {
  id: string;
  label: string;
  questions: string[];
};

export function AgentConsole({
  suggestionGroups = [],
  intro = "La respuesta usa recuperación semántica sobre los fragmentos autorizados y cita cada fuente. Si la evidencia no alcanza, el asistente se abstiene.",
  knowledgeBaseLabel,
}: {
  suggestionGroups?: SuggestionGroup[];
  intro?: string;
  knowledgeBaseLabel?: string;
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

      <div className="agent-suggestions">
        <span>Preguntas sugeridas</span>
        {(suggestionGroups.length
          ? suggestionGroups
          : [{ id: "default", label: "", questions: DEFAULT_SUGGESTIONS }]
        ).map((group) => (
          <div className="agent-suggestion-group" key={group.id}>
            {group.label ? <strong>{group.label}</strong> : null}
            <div className="agent-suggestion-buttons">
              {group.questions.map((suggestion) => (
                <button
                  key={`${group.id}-${suggestion}`}
                  type="button"
                  disabled={state.status === "loading"}
                  onClick={() => {
                    setQuestion(suggestion);
                    void ask(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

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

      {state.status === "success" ? (
        <Answer data={state.data} knowledgeBaseLabel={knowledgeBaseLabel} />
      ) : null}
    </section>
  );
}

function Answer({
  data,
  knowledgeBaseLabel,
}: {
  data: AgentQueryResponse;
  knowledgeBaseLabel?: string;
}) {
  const label =
    data.outcome === "answered"
      ? "Respuesta con fuentes"
      : data.outcome === "blocked"
        ? "Solicitud bloqueada"
        : data.outcome === "rejected"
          ? "Consulta rechazada"
          : data.outcome === "out_of_scope"
            ? "Fuera de alcance"
            : data.outcome === "error"
              ? "Error"
              : "Sin evidencia suficiente";
  const tone = OUTCOME_TONES[data.outcome] ?? "outcome-tag-muted";

  return (
    <div className="agent-answer" aria-live="polite">
      <div className="agent-answer-head">
        <div className="agent-answer-tags">
          {knowledgeBaseLabel ? (
            <span className="agent-base-tag">{knowledgeBaseLabel}</span>
          ) : null}
          <span className={`agent-tag ${tone}`}>{label}</span>
        </div>
        <span className="agent-meta">
          {data.sources.length} fuente{data.sources.length === 1 ? "" : "s"} ·{" "}
          {Math.round(data.latencyMs / 100) / 10}s
        </span>
      </div>

      <RichAnswer
        className="agent-answer-text"
        answer={data.answer}
        sources={data.sources}
      />

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
