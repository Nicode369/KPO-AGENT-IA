import Link from "next/link";
import { connection } from "next/server";

import { AuditSubnav } from "@/components/audit-subnav";
import { HistoryIcon } from "@/components/icons";
import { recordAuditEvent } from "@/lib/audit/log";
import { AUDIT_EVENT_LABELS, AUDIT_EVENT_TYPES, auditEventLabel, auditEventTone } from "@/lib/audit/labels";
import {
  AUDIT_EVENT_PAGE_SIZE,
  getAuditLog,
  normalizeAuditLogFilters,
  verifyAuditChain,
  type AuditChainVerification,
  type AuditLogFilters,
  type AuditLogRow,
} from "@/lib/admin/audit-events";
import { normalizeAuditPage } from "@/lib/admin/audit";
import { getAdminGroups } from "@/lib/admin/data";
import { requireAdminUser } from "@/lib/auth/workspace";
import { formatDateTime } from "@/lib/datetime";

export const instant = false;

type SearchParams = Promise<{
  q?: string;
  type?: string;
  group?: string;
  from?: string;
  to?: string;
  page?: string;
  verify?: string;
}>;

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AdminAuditEventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await searchParams;
  const { supabase, userId, profile, isSuperadmin, adminGroupIds } =
    await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);
  const page = normalizeAuditPage(params.page);
  const filters = normalizeAuditLogFilters(
    {
      q: param(params.q),
      eventType: param(params.type),
      groupId: param(params.group),
      from: param(params.from),
      to: param(params.to),
    },
    isSuperadmin,
    adminGroupIds,
  );

  const result = await getAuditLog(isSuperadmin, adminGroupIds, filters, page);
  const verifyRequested = param(params.verify) === "1";
  let verification: AuditChainVerification | null = null;

  if (verifyRequested && result.configured) {
    verification = await verifyAuditChain();
    await recordAuditEvent({
      eventType: verification.ok ? "audit_integrity_check" : "audit_integrity_failed",
      actorId: userId,
      actorEmail: profile.email,
      targetType: "audit_chain",
      targetId: "audit_events",
      metadata: {
        ok: verification.ok,
        checked: verification.checked,
        broken_seq: verification.brokenSeq,
      },
    });
  }

  const totalPages = Math.max(1, Math.ceil(result.total / AUDIT_EVENT_PAGE_SIZE));
  const hasFilters = Boolean(
    filters.q || filters.eventType || filters.groupId || filters.from || filters.to,
  );
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const exportHref = exportUrl(filters);
  const lastEvent = result.events[0];

  return (
    <main className="admin-content">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Auditoría</p>
          <h1>Eventos de auditoría</h1>
          <p className="workspace-lead">
            Cada evento relevante se registra de forma append-only y se enlaza con el
            anterior mediante un hash SHA-256. Autenticación, administración y ciclo
            documental quedan encadenados.
          </p>
        </div>
        <Link className="button button-secondary" href="/admin">
          Volver al resumen
        </Link>
      </div>

      <AuditSubnav active="events" />

      {!result.configured ? (
        <section className="admin-panel admin-panel-warning">
          <h2>Auditoría no configurada</h2>
          <p>
            Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en el servidor. La clave es
            necesaria para leer y verificar la cadena de auditoría.
          </p>
        </section>
      ) : null}

      {result.error ? (
        <section className="admin-panel admin-panel-warning">
          <h2>No fue posible cargar los eventos</h2>
          <p>{result.error}</p>
        </section>
      ) : null}

      {verification ? (
        <section
          className={`admin-panel ${
            verification.ok ? "admin-panel-success" : "admin-panel-warning"
          }`}
        >
          <h2>
            {verification.ok
              ? "Cadena de auditoría íntegra"
              : "Se detectó una alteración en la cadena"}
          </h2>
          <p>{verification.message}</p>
          <p className="admin-muted">
            Eventos verificados: {verification.checked}
            {verification.brokenSeq != null
              ? ` · Primer problema en la secuencia ${verification.brokenSeq}`
              : ""}
          </p>
          {verification.error ? <p>{verification.error}</p> : null}
        </section>
      ) : null}

      {result.configured && !result.error ? (
        <>
          <section className="admin-stats" aria-label="Resumen de eventos">
            <div className="admin-stat">
              <span>Eventos</span>
              <strong>{result.total}</strong>
              <small>Visibles para tu perfil</small>
            </div>
            <div className="admin-stat">
              <span>En esta página</span>
              <strong>{result.events.length}</strong>
              <small>Máximo {AUDIT_EVENT_PAGE_SIZE}</small>
            </div>
            <div className="admin-stat">
              <span>Página</span>
              <strong>
                {result.page} / {totalPages}
              </strong>
              <small>Más recientes primero</small>
            </div>
            <div className="admin-stat">
              <span>Último hash</span>
              <strong className="audit-hash-stat">
                {lastEvent ? lastEvent.event_hash.slice(0, 10) : "—"}
              </strong>
              <small>{lastEvent ? `Secuencia ${lastEvent.seq}` : "Sin eventos"}</small>
            </div>
          </section>

          <section className="admin-panel">
            <h2>Filtros y verificación</h2>
            <form className="admin-filter admin-filter-audit" method="get">
              <div className="admin-field">
                <label htmlFor="event-q">Buscar</label>
                <input
                  id="event-q"
                  name="q"
                  defaultValue={filters.q}
                  placeholder="Correo del actor u objetivo"
                />
              </div>
              <div className="admin-field">
                <label htmlFor="event-type">Tipo de evento</label>
                <select id="event-type" name="type" defaultValue={filters.eventType}>
                  <option value="">Todos los eventos</option>
                  {AUDIT_EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {AUDIT_EVENT_LABELS[type] ?? type}
                    </option>
                  ))}
                </select>
              </div>
              {groups.length > 1 ? (
                <div className="admin-field">
                  <label htmlFor="event-group">Grupo</label>
                  <select id="event-group" name="group" defaultValue={filters.groupId}>
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
                <label htmlFor="event-from">Desde</label>
                <input
                  id="event-from"
                  name="from"
                  type="date"
                  defaultValue={filters.from}
                />
              </div>
              <div className="admin-field">
                <label htmlFor="event-to">Hasta</label>
                <input id="event-to" name="to" type="date" defaultValue={filters.to} />
              </div>
              <div className="admin-filter-actions">
                <button type="submit">Filtrar</button>
                {hasFilters ? (
                  <Link className="admin-button admin-button-secondary" href="/admin/audit/events">
                    Limpiar
                  </Link>
                ) : null}
                <a className="admin-button admin-button-secondary" href={exportHref}>
                  Exportar CSV
                </a>
              </div>
            </form>

            <form className="audit-verify-form" method="get">
              {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
              {filters.eventType ? (
                <input type="hidden" name="type" value={filters.eventType} />
              ) : null}
              {filters.groupId ? (
                <input type="hidden" name="group" value={filters.groupId} />
              ) : null}
              {filters.from ? <input type="hidden" name="from" value={filters.from} /> : null}
              {filters.to ? <input type="hidden" name="to" value={filters.to} /> : null}
              <input type="hidden" name="verify" value="1" />
              <button type="submit" className="admin-button admin-button-secondary">
                Verificar integridad de la cadena
              </button>
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
                  />
                ))}
              </div>
              {totalPages > 1 ? (
                <nav className="admin-pagination" aria-label="Paginación de eventos">
                  {result.page > 1 ? (
                    <Link
                      className="admin-button admin-button-secondary"
                      href={eventsHref(filters, result.page - 1)}
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
                      href={eventsHref(filters, result.page + 1)}
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
              <h2>{hasFilters ? "Sin coincidencias" : "Sin eventos registrados"}</h2>
              <p>
                {hasFilters
                  ? "Ningún evento coincide con los filtros aplicados."
                  : "La cadena de auditoría todavía no tiene eventos."}
              </p>
              {hasFilters ? (
                <Link className="button button-secondary" href="/admin/audit/events">
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
}: {
  event: AuditLogRow;
  groupNames: Map<string, string>;
}) {
  const tone = auditEventTone(event.event_type);
  const label = auditEventLabel(event.event_type);

  return (
    <article className="history-item">
      <div className="history-item-head">
        <span className={`admin-tag ${tone}`}>{label}</span>
        <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
      </div>

      <h2>{label}</h2>

      <dl className="history-meta">
        <div>
          <dt>Secuencia</dt>
          <dd>{event.seq}</dd>
        </div>
        <div>
          <dt>Actor</dt>
          <dd>{event.actor_name ?? event.actor_email ?? "Sistema"}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{event.actor_email ?? "—"}</dd>
        </div>
        <div>
          <dt>Grupo</dt>
          <dd>
            {event.group_id ? (groupNames.get(event.group_id) ?? "Grupo") : "Global"}
          </dd>
        </div>
        <div>
          <dt>Objetivo</dt>
          <dd>
            {event.target_type ?? "—"}
            {event.target_id ? ` · ${event.target_id}` : ""}
          </dd>
        </div>
      </dl>

      <details className="history-sources">
        <summary>Metadatos y hash</summary>
        <pre className="audit-metadata">
          {JSON.stringify(event.metadata, null, 2)}
        </pre>
        <p className="audit-hash">
          <span>Hash:</span> <code>{event.event_hash}</code>
        </p>
        <p className="audit-hash">
          <span>Anterior:</span> <code>{event.prev_hash ?? "—"}</code>
        </p>
      </details>
    </article>
  );
}

function eventsHref(filters: AuditLogFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.eventType) params.set("type", filters.eventType);
  if (filters.groupId) params.set("group", filters.groupId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/audit/events?${query}` : "/admin/audit/events";
}

function exportUrl(filters: AuditLogFilters): string {
  const params = new URLSearchParams({ dataset: "events" });
  if (filters.q) params.set("q", filters.q);
  if (filters.eventType) params.set("type", filters.eventType);
  if (filters.groupId) params.set("group", filters.groupId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return `/api/admin/audit/export?${params.toString()}`;
}
