import Link from "next/link";
import { connection } from "next/server";

import { AuditSubnav } from "@/components/audit-subnav";
import { HistoryIcon } from "@/components/icons";
import { RichAnswer } from "@/components/rich-answer";
import {
  AUDIT_OUTCOMES,
  AUDIT_PAGE_SIZE,
  getAuditEvents,
  getAuditQueryCount,
  normalizeAuditFilters,
  normalizeAuditPage,
  type AuditEvent,
  type AuditFilterInput,
  type AuditSource,
} from "@/lib/admin/audit";
import { getAdminGroups } from "@/lib/admin/data";
import { OUTCOME_LABELS, OUTCOME_TONES, REASON_LABELS } from "@/lib/agent/labels";
import { requireAdminUser } from "@/lib/auth/workspace";
import { formatDateTime } from "@/lib/datetime";

export const instant = false;

const OUTCOME_OPTIONS = [
  ["", "Todos los resultados"],
  ...AUDIT_OUTCOMES.map(
    (outcome) => [outcome, OUTCOME_LABELS[outcome] ?? outcome] as const,
  ),
];

type SearchParams = Promise<{
  q?: string;
  outcome?: string;
  group?: string;
  user?: string;
  from?: string;
  to?: string;
  page?: string;
}>;

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await searchParams;
  const { supabase, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);
  const page = normalizeAuditPage(params.page);
  const filters = normalizeAuditFilters(
    {
      q: param(params.q),
      outcome: param(params.outcome),
      groupId: param(params.group),
      user: param(params.user),
      from: param(params.from),
      to: param(params.to),
    },
    isSuperadmin,
    adminGroupIds,
  );

  const [result, count24h] = await Promise.all([
    getAuditEvents(isSuperadmin, adminGroupIds, filters, page),
    getAuditQueryCount(isSuperadmin, adminGroupIds),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / AUDIT_PAGE_SIZE));
  const hasFilters = Boolean(
    filters.q ||
      filters.outcome ||
      filters.groupId ||
      filters.user ||
      filters.from ||
      filters.to,
  );
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  return (
    <main className="admin-content">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Auditoría</p>
          <h1>Historial de consultas</h1>
          <p className="workspace-lead">
            Revisa cada consulta registrada: usuario, pregunta, respuesta, resultado,
            modelo, latencia y fuentes recuperadas.
            {isSuperadmin
              ? " Como superadmin ves todos los grupos."
              : " Solo ves las consultas de los grupos que administras."}
          </p>
        </div>
        <Link className="button button-secondary" href="/admin">
          Volver al resumen
        </Link>
      </div>

      <AuditSubnav active="queries" />

      {!result.configured ? (
        <section className="admin-panel admin-panel-warning">
          <h2>Auditoría no configurada</h2>
          <p>
            Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en el servidor. La clave es
            necesaria para que administradores puedan leer el historial de todos los
            usuarios. El historial personal de cada usuario sigue disponible en{" "}
            <code>/app/history</code>.
          </p>
        </section>
      ) : null}

      {result.error ? (
        <section className="admin-panel admin-panel-warning">
          <h2>No fue posible cargar el historial</h2>
          <p>{result.error}</p>
        </section>
      ) : null}

      {result.configured && !result.error ? (
        <>
          <section className="admin-stats" aria-label="Resumen de auditoría">
            <div className="admin-stat">
              <span>Consultas en 24 h</span>
              <strong>{count24h ?? "—"}</strong>
              <small>Visibles para tu perfil</small>
            </div>
            <div className="admin-stat">
              <span>Resultados del filtro</span>
              <strong>{result.total}</strong>
              <small>Registros coincidentes</small>
            </div>
            <div className="admin-stat">
              <span>En esta página</span>
              <strong>{result.events.length}</strong>
              <small>Máximo {AUDIT_PAGE_SIZE}</small>
            </div>
            <div className="admin-stat">
              <span>Página</span>
              <strong>
                {result.page} / {totalPages}
              </strong>
              <small>Orden: más recientes primero</small>
            </div>
          </section>

          <section className="admin-panel">
            <h2>Filtros</h2>
            <form className="admin-filter admin-filter-audit" method="get">
              <div className="admin-field">
                <label htmlFor="audit-q">Buscar en la pregunta</label>
                <input
                  id="audit-q"
                  name="q"
                  defaultValue={filters.q}
                  placeholder="Texto de la consulta"
                />
              </div>
              <div className="admin-field">
                <label htmlFor="audit-outcome">Resultado</label>
                <select
                  id="audit-outcome"
                  name="outcome"
                  defaultValue={filters.outcome}
                >
                  {OUTCOME_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {groups.length > 1 ? (
                <div className="admin-field">
                  <label htmlFor="audit-group">Grupo</label>
                  <select id="audit-group" name="group" defaultValue={filters.groupId}>
                    <option value="">Todos los grupos</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="admin-field">
                <label htmlFor="audit-user">Usuario</label>
                <input
                  id="audit-user"
                  name="user"
                  defaultValue={filters.user}
                  placeholder="Correo del usuario"
                />
              </div>
              <div className="admin-field">
                <label htmlFor="audit-from">Desde</label>
                <input
                  id="audit-from"
                  name="from"
                  type="date"
                  defaultValue={filters.from}
                />
              </div>
              <div className="admin-field">
                <label htmlFor="audit-to">Hasta</label>
                <input id="audit-to" name="to" type="date" defaultValue={filters.to} />
              </div>
              <div className="admin-filter-actions">
                <button type="submit">Filtrar</button>
                {hasFilters ? (
                  <Link className="admin-button admin-button-secondary" href="/admin/audit">
                    Limpiar
                  </Link>
                ) : null}
                <a className="admin-button admin-button-secondary" href={exportUrl(filters)}>
                  Exportar CSV
                </a>
              </div>
            </form>
          </section>

          {result.events.length ? (
            <>
              <div className="history-list">
                {result.events.map((event) => (
                  <AuditEventItem
                    event={event}
                    groupNames={groupNames}
                    key={event.id}
                    sources={result.sourcesByQuery[event.id] ?? []}
                  />
                ))}
              </div>
              {totalPages > 1 ? (
                <nav className="admin-pagination" aria-label="Paginación del historial">
                  {result.page > 1 ? (
                    <Link
                      className="admin-button admin-button-secondary"
                      href={auditHref(filters, result.page - 1)}
                    >
                      Anterior
                    </Link>
                  ) : (
                    <span className="admin-button admin-button-secondary" aria-disabled="true">
                      Anterior
                    </span>
                  )}
                  <span>
                    Página {result.page} de {totalPages}
                  </span>
                  {result.page < totalPages ? (
                    <Link
                      className="admin-button admin-button-secondary"
                      href={auditHref(filters, result.page + 1)}
                    >
                      Siguiente
                    </Link>
                  ) : (
                    <span className="admin-button admin-button-secondary" aria-disabled="true">
                      Siguiente
                    </span>
                  )}
                </nav>
              ) : null}
            </>
          ) : (
            <section className="history-empty">
              <HistoryIcon size={28} />
              <h2>{hasFilters ? "Sin coincidencias" : "Sin consultas registradas"}</h2>
              <p>
                {hasFilters
                  ? "Ninguna consulta coincide con los filtros aplicados."
                  : "Todavía no hay consultas en los grupos que administras."}
              </p>
              {hasFilters ? (
                <Link className="button button-secondary" href="/admin/audit">
                  Limpiar filtros
                </Link>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}

function AuditEventItem({
  event,
  groupNames,
  sources,
}: {
  event: AuditEvent;
  groupNames: Map<string, string>;
  sources: AuditSource[];
}) {
  const tone = OUTCOME_TONES[event.outcome] ?? "outcome-tag-muted";
  const label = OUTCOME_LABELS[event.outcome] ?? event.outcome;
  const scope = event.group_ids.length
    ? event.group_ids.map((id) => groupNames.get(id) ?? "Grupo").join(", ")
    : "Sin grupo";

  return (
    <article className="history-item">
      <div className="history-item-head">
        <span className={`admin-tag ${tone}`}>{label}</span>
        <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
      </div>

      <h2>{event.question}</h2>

      {event.answer ? (
        <RichAnswer className="history-answer" answer={event.answer} />
      ) : (
        <p className="admin-muted">No se generó una respuesta para esta consulta.</p>
      )}

      <dl className="history-meta">
        <div>
          <dt>Usuario</dt>
          <dd>{event.user_name ?? event.user_email}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{event.user_email}</dd>
        </div>
        <div>
          <dt>Grupo</dt>
          <dd>{scope}</dd>
        </div>
        <div>
          <dt>Modelo</dt>
          <dd>{event.model ?? "—"}</dd>
        </div>
        <div>
          <dt>Prompt</dt>
          <dd>{event.prompt_version ?? "—"}</dd>
        </div>
        <div>
          <dt>Latencia</dt>
          <dd>{formatLatency(event.latency_ms)}</dd>
        </div>
        <div>
          <dt>Fuentes</dt>
          <dd>{event.source_count}</dd>
        </div>
        <div>
          <dt>Grounding</dt>
          <dd>{formatScore(event.grounding_score)}</dd>
        </div>
      </dl>

      {event.outcome_reason ? (
        <p className="history-reason">
          {REASON_LABELS[event.outcome_reason] ?? "Motivo registrado en la auditoría."}
        </p>
      ) : null}

      {sources.length ? (
        <details className="history-sources">
          <summary>Fuentes usadas ({sources.length})</summary>
          <ol>
            {sources.map((source) => (
              <li key={`${event.id}-${source.rank}`} value={source.rank}>
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
}

function auditHref(filters: AuditFilterInput, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (filters.groupId) params.set("group", filters.groupId);
  if (filters.user) params.set("user", filters.user);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
}

function exportUrl(filters: AuditFilterInput): string {
  const params = new URLSearchParams({ dataset: "queries" });
  if (filters.q) params.set("q", filters.q);
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (filters.groupId) params.set("group", filters.groupId);
  if (filters.user) params.set("user", filters.user);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return `/api/admin/audit/export?${params.toString()}`;
}

function formatLatency(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value / 100) / 10} s`;
}

function formatScore(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
