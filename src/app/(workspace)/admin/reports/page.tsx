import Link from "next/link";
import { connection } from "next/server";

import { AuditSubnav } from "@/components/audit-subnav";
import { OUTCOME_LABELS, OUTCOME_TONES } from "@/lib/agent/labels";
import { documentStatusLabel, documentStatusTone } from "@/lib/admin/documents";
import { getAuditOverview } from "@/lib/admin/reports";
import { requireAdminUser } from "@/lib/auth/workspace";
import { formatDateTime } from "@/lib/datetime";

export const instant = false;

const DOCUMENT_STATUS_ORDER = [
  "published",
  "approved",
  "pending_review",
  "processing",
  "uploaded",
  "rejected",
  "retired",
  "error",
];

export default async function AdminReportsPage() {
  await connection();
  const { isSuperadmin, adminGroupIds } = await requireAdminUser();
  const overview = await getAuditOverview(isSuperadmin, adminGroupIds);

  return (
    <main className="admin-content">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Auditoría</p>
          <h1>Reportes</h1>
          <p className="workspace-lead">
            Resumen de actividad del agente, alertas de seguridad, eventos auditados y
            estado del ciclo documental. Las exportaciones respetan el alcance de tu
            perfil.
          </p>
        </div>
        <Link className="button button-secondary" href="/admin">
          Volver al resumen
        </Link>
      </div>

      <AuditSubnav active="reports" />

      {!overview.configured ? (
        <section className="admin-panel admin-panel-warning">
          <h2>Reportes no configurados</h2>
          <p>
            Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en el servidor para consultar
            métricas globales y exportar auditoría.
          </p>
        </section>
      ) : null}

      {overview.error ? (
        <section className="admin-panel admin-panel-warning">
          <h2>No fue posible calcular todos los reportes</h2>
          <p>{overview.error}</p>
        </section>
      ) : null}

      {overview.configured ? (
        <>
          <section className="admin-stats" aria-label="Resumen de reportes">
            <div className="admin-stat">
              <span>Consultas 24 h</span>
              <strong>{overview.queries24h}</strong>
              <small>Visibles para tu perfil</small>
            </div>
            <div className="admin-stat">
              <span>Alertas de seguridad 24 h</span>
              <strong>{overview.security24h ?? "—"}</strong>
              <small>Bloqueos y rechazos</small>
            </div>
            <div className="admin-stat">
              <span>Eventos auditados 24 h</span>
              <strong>{overview.audit24h}</strong>
              <small>Cadena SHA-256</small>
            </div>
            <div className="admin-stat">
              <span>Eventos auditados totales</span>
              <strong>{overview.auditTotal}</strong>
              <small>Append-only</small>
            </div>
          </section>

          <section className="admin-panel">
            <h2>Resultados del agente (24 h)</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Resultado</th>
                    <th>Consultas</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(overview.queriesByOutcome).map(([outcome, count]) => (
                    <tr key={outcome}>
                      <td>
                        <span
                          className={`admin-tag ${
                            OUTCOME_TONES[outcome] ?? "outcome-tag-muted"
                          }`}
                        >
                          {OUTCOME_LABELS[outcome] ?? outcome}
                        </span>
                      </td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panel">
            <h2>Documentos por estado</h2>
            <p className="admin-muted">
              Total visible: {overview.documentsTotal}
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Documentos</th>
                  </tr>
                </thead>
                <tbody>
                  {DOCUMENT_STATUS_ORDER.map((status) => (
                    <tr key={status}>
                      <td>
                        <span className={`admin-tag admin-tag-${documentStatusTone(status)}`}>
                          {documentStatusLabel(status)}
                        </span>
                      </td>
                      <td>{overview.documentsByStatus[status] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panel">
            <h2>Integridad de la cadena</h2>
            {overview.lastEvent ? (
              <dl className="history-meta">
                <div>
                  <dt>Último evento</dt>
                  <dd>{overview.lastEvent.event_type}</dd>
                </div>
                <div>
                  <dt>Secuencia</dt>
                  <dd>{overview.lastEvent.seq}</dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{formatDateTime(overview.lastEvent.created_at)}</dd>
                </div>
                <div>
                  <dt>Hash</dt>
                  <dd>
                    <code>{overview.lastEvent.event_hash.slice(0, 16)}…</code>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="admin-muted">Todavía no hay eventos en la cadena.</p>
            )}
            <div className="admin-actions">
              <Link className="admin-button" href="/admin/audit/events">
                Ver eventos
              </Link>
              <Link
                className="admin-button admin-button-secondary"
                href="/admin/audit/events?verify=1"
                prefetch={false}
              >
                Verificar integridad
              </Link>
            </div>
          </section>

          <section className="admin-panel">
            <h2>Exportaciones protegidas</h2>
            <p>
              Descarga CSV con el alcance de tu perfil. Cada exportación queda registrada
              en la cadena de auditoría.
            </p>
            <div className="admin-actions">
              <a
                className="admin-button"
                href="/api/admin/audit/export?dataset=queries"
              >
                Exportar consultas
              </a>
              <a
                className="admin-button admin-button-secondary"
                href="/api/admin/audit/export?dataset=events"
              >
                Exportar eventos
              </a>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
