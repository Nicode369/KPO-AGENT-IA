import Link from "next/link";
import { connection } from "next/server";

import { OUTCOME_LABELS, OUTCOME_TONES, REASON_LABELS } from "@/lib/agent/labels";
import { getSecurityEvents, type SecurityEvent } from "@/lib/admin/security";
import { requireAdminUser } from "@/lib/auth/workspace";

export const instant = false;

export default async function AdminSecurityPage() {
  await connection();
  const { isSuperadmin, adminGroupIds } = await requireAdminUser();
  const result = await getSecurityEvents(isSuperadmin, adminGroupIds);
  const blocked = result.events.filter((event) => event.outcome === "blocked").length;
  const rejected = result.events.filter((event) => event.outcome === "rejected").length;

  return (
    <main className="admin-content">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Seguridad</p>
          <h1>Intentos bloqueados y rechazados</h1>
          <p className="workspace-lead">
            Revisa las solicitudes que intentaron acceder a instrucciones internas,
            secretos, otros grupos o alterar la evidencia. Cada evento queda ligado a su
            consulta de auditoría.
          </p>
        </div>
        <Link className="button button-secondary" href="/admin">
          Volver al resumen
        </Link>
      </div>

      {!result.configured ? (
        <section className="admin-panel admin-panel-warning">
          <h2>Alertas de seguridad no configuradas</h2>
          <p>
            Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en el servidor. La clave es
            necesaria para que administradores puedan ver eventos de todos los usuarios.
            Los bloqueos y rechazos se siguen registrando en la auditoría de cada consulta.
          </p>
        </section>
      ) : null}

      {result.error ? (
        <section className="admin-panel admin-panel-warning">
          <h2>No fue posible cargar las alertas</h2>
          <p>{result.error}</p>
        </section>
      ) : null}

      {result.configured && !result.error ? (
        <>
          <section className="admin-stats" aria-label="Resumen de seguridad">
            <div className="admin-stat">
              <span>Eventos en 24 h</span>
              <strong>{result.last24h}</strong>
              <small>Bloqueos y rechazos</small>
            </div>
            <div className="admin-stat">
              <span>Últimos eventos</span>
              <strong>{result.events.length}</strong>
              <small>Máximo 100 registros</small>
            </div>
            <div className="admin-stat">
              <span>Bloqueados</span>
              <strong>{blocked}</strong>
              <small>Alta severidad</small>
            </div>
            <div className="admin-stat">
              <span>Rechazados</span>
              <strong>{rejected}</strong>
              <small>Revisión media</small>
            </div>
          </section>

          {result.events.length ? (
            <div className="history-list">
              {result.events.map((event) => (
                <SecurityEventItem event={event} key={event.id} />
              ))}
            </div>
          ) : (
            <section className="history-empty">
              <h2>Sin intentos registrados</h2>
              <p>
                Todavía no hay solicitudes bloqueadas o rechazadas en los grupos que
                administras.
              </p>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}

function SecurityEventItem({ event }: { event: SecurityEvent }) {
  const tone = OUTCOME_TONES[event.outcome] ?? "admin-tag-error";
  const label = OUTCOME_LABELS[event.outcome] ?? event.outcome;

  return (
    <article className="history-item">
      <div className="history-item-head">
        <span className={`admin-tag ${tone}`}>{label}</span>
        <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
      </div>
      <h2>{event.question}</h2>
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
          <dt>Motivo</dt>
          <dd>
            {event.outcome_reason
              ? REASON_LABELS[event.outcome_reason] ?? event.outcome_reason
              : "Sin motivo registrado"}
          </dd>
        </div>
        <div>
          <dt>Severidad</dt>
          <dd>{controlValue(event, "security_severity")}</dd>
        </div>
        <div>
          <dt>Acción</dt>
          <dd>{controlValue(event, "security_action")}</dd>
        </div>
        <div>
          <dt>Fuentes</dt>
          <dd>{event.source_count}</dd>
        </div>
      </dl>
    </article>
  );
}

function controlValue(event: SecurityEvent, key: string): string {
  const value = event.controls?.[key];
  if (typeof value === "string") return value;
  if (key === "security_action") return event.outcome;
  if (key === "security_severity") {
    return event.outcome === "blocked" ? "high" : "medium";
  }
  return "—";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
