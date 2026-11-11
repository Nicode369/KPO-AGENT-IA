import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { HistoryIcon } from "@/components/icons";
import { OUTCOME_LABELS, OUTCOME_TONES, REASON_LABELS } from "@/lib/agent/labels";
import { isDemoEmail } from "@/lib/auth/demo";
import { requireWorkspaceUser } from "@/lib/auth/workspace";
import { formatDateTime } from "@/lib/datetime";

export const instant = false;

type HistoryQuery = {
  id: string;
  question: string;
  answer: string | null;
  outcome: string;
  outcome_reason: string | null;
  abstained: boolean;
  model: string | null;
  prompt_version: string | null;
  latency_ms: number | null;
  source_count: number;
  grounding_score: number | null;
  created_at: string;
};

type HistorySource = {
  query_id: string;
  rank: number;
  similarity: number | null;
  document_title: string | null;
  document_version: number | null;
};

export default async function HistoryPage() {
  await connection();
  const { supabase, profile } = await requireWorkspaceUser();
  if (isDemoEmail(profile.email)) redirect("/app?demo=1");

  const { data, error } = await supabase
    .from("agent_queries")
    .select(
      "id, question, answer, outcome, outcome_reason, abstained, model, prompt_version, latency_ms, source_count, grounding_score, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const queries = (data ?? []) as HistoryQuery[];
  const sourcesByQuery = new Map<string, HistorySource[]>();

  if (queries.length) {
    const ids = queries.map((query) => query.id);
    const { data: sourceData } = await supabase
      .from("agent_query_sources")
      .select("query_id, rank, similarity, document_title, document_version")
      .in("query_id", ids)
      .order("rank", { ascending: true });

    for (const source of (sourceData ?? []) as HistorySource[]) {
      const list = sourcesByQuery.get(source.query_id) ?? [];
      list.push(source);
      sourcesByQuery.set(source.query_id, list);
    }
  }

  return (
    <main className="signed-in-content history-page">
      <div className="history-head">
        <div>
          <p className="admin-eyebrow">Trazabilidad</p>
          <h1>Historial de consultas</h1>
          <p className="workspace-lead">
            Cada consulta registra su resultado, las fuentes recuperadas y el modelo
            utilizado. El historial es personal y respeta el aislamiento entre grupos.
          </p>
        </div>
        <Link className="button button-secondary" href="/app">
          Volver al asistente
        </Link>
      </div>

      {error ? (
        <section className="admin-panel admin-panel-warning">
          <h2>Historial no disponible</h2>
          <p>
            No fue posible cargar el historial. Verifica que las migraciones de la fase 5
            estén aplicadas.
          </p>
        </section>
      ) : null}

      {!error && !queries.length ? (
        <section className="history-empty">
          <HistoryIcon size={28} />
          <h2>Todavía no hay consultas registradas</h2>
          <p>
            Haz una pregunta al asistente y aparecerá aquí con su resultado y sus fuentes.
          </p>
          <Link className="button button-secondary" href="/app">
            Ir al asistente
          </Link>
        </section>
      ) : null}

      {!error && queries.length ? (
        <div className="history-list">
          {queries.map((query) => {
            const sources = sourcesByQuery.get(query.id) ?? [];
            const tone = OUTCOME_TONES[query.outcome] ?? "admin-tag-muted";
            const label = OUTCOME_LABELS[query.outcome] ?? query.outcome;

            return (
              <article className="history-item" key={query.id}>
                <div className="history-item-head">
                  <span className={`admin-tag ${tone}`}>{label}</span>
                  <time dateTime={query.created_at}>
                    {formatDateTime(query.created_at)}
                  </time>
                </div>

                <h2>{query.question}</h2>

                {query.answer ? (
                  <p className="history-answer">{query.answer}</p>
                ) : (
                  <p className="admin-muted">
                    No se generó una respuesta para esta consulta.
                  </p>
                )}

                <dl className="history-meta">
                  <div>
                    <dt>Modelo</dt>
                    <dd>{query.model ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Prompt</dt>
                    <dd>{query.prompt_version ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Latencia</dt>
                    <dd>{formatLatency(query.latency_ms)}</dd>
                  </div>
                  <div>
                    <dt>Fuentes</dt>
                    <dd>{query.source_count}</dd>
                  </div>
                  <div>
                    <dt>Grounding</dt>
                    <dd>{formatScore(query.grounding_score)}</dd>
                  </div>
                </dl>

                {query.outcome_reason ? (
                  <p className="history-reason">
                    {REASON_LABELS[query.outcome_reason] ?? "Motivo registrado en la auditoría."}
                  </p>
                ) : null}

                {sources.length ? (
                  <details className="history-sources">
                    <summary>Fuentes usadas ({sources.length})</summary>
                    <ol>
                      {sources.map((source) => (
                        <li key={`${query.id}-${source.rank}`} value={source.rank}>
                          <strong>{source.document_title ?? "Documento"}</strong>
                          <span>
                            {source.document_version != null
                              ? `v${source.document_version} · `
                              : ""}
                            {source.similarity != null
                              ? `similitud ${formatScore(source.similarity)}`
                              : "sin similitud"}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}

function formatLatency(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value / 100) / 10} s`;
}

function formatScore(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
