import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { requireAdminUser } from "@/lib/auth/workspace";
import { formatDateOnly, formatDateTime } from "@/lib/datetime";
import { getAdminGroups } from "@/lib/admin/data";
import {
  documentStatusLabel,
  documentStatusTone,
  documentTypeLabel,
  formatBytes,
  getAdminDocumentDetail,
  visibilityLabel,
} from "@/lib/admin/documents";
import {
  AccessForm,
  ApproveDocumentForm,
  MetadataForm,
  NewVersionForm,
  PublishDocumentForm,
  RejectDocumentForm,
  ReprocessDocumentForm,
  RetireDocumentForm,
} from "../document-forms";

export const instant = false;

const EVENT_LABELS: Record<string, string> = {
  uploaded: "Cargado",
  processing: "Procesando",
  processed: "Procesado",
  approved: "Aprobado",
  published: "Publicado",
  retired: "Retirado",
  rejected: "Rechazado",
  error: "Error",
  version_created: "Nueva versión",
  metadata_updated: "Metadatos actualizados",
  access_updated: "Acceso actualizado",
};

function dateTime(value: string | null): string {
  return value ? formatDateTime(value) : "—";
}

function dateOnly(value: string | null): string {
  return value ? formatDateOnly(value) : "—";
}

export default async function AdminDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const { supabase, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);

  let detail: Awaited<ReturnType<typeof getAdminDocumentDetail>> = null;
  let loadError: string | null = null;

  try {
    detail = await getAdminDocumentDetail(supabase, id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  if (!detail && !loadError) notFound();

  if (!detail) {
    return (
      <main className="admin-content">
        <div className="admin-page-head">
          <div>
            <p className="admin-eyebrow">Gestión documental</p>
            <h1>Documento no disponible</h1>
          </div>
          <Link className="admin-button admin-button-secondary" href="/admin/documents">
            Volver
          </Link>
        </div>
        <section className="admin-panel admin-panel-warning">
          <h2>No se pudo cargar el documento</h2>
          <p>{loadError}</p>
          <p>Si acabas de desplegar, verifica que la migración documental esté aplicada.</p>
        </section>
      </main>
    );
  }

  const { document, groupName, versions, events, currentVersion, originalUrl, processedUrl, accessGroupIds } = detail;
  const canApprove = document.status === "pending_review";
  const canReject = document.status === "pending_review";
  const canPublish = document.status === "approved";
  const canRetire =
    document.status === "approved" ||
    document.status === "published" ||
    Boolean(document.published_version_id);
  const canReprocess = ["uploaded", "error", "rejected", "pending_review"].includes(
    document.status,
  );
  const canCreateVersion = document.status !== "processing";

  return (
    <main className="admin-content">
      <div className="admin-page-head admin-page-head-detail">
        <div>
          <p className="admin-eyebrow">
            <Link href="/admin/documents">Documentos</Link> / {groupName}
          </p>
          <h1>{document.title}</h1>
          <p className="workspace-lead">
            {documentTypeLabel(document.document_type)}
            {document.norm_number ? ` · ${document.norm_number}` : ""} · versión{" "}
            {document.version}
            {document.version_label ? ` (${document.version_label})` : ""}
          </p>
        </div>
        <Link className="admin-button admin-button-secondary" href="/admin/documents">
          Volver a la biblioteca
        </Link>
      </div>

      <section className="admin-doc-banner" aria-label="Estado del documento">
        <div className="admin-doc-badges">
          <span className={`admin-tag admin-tag-${documentStatusTone(document.status)}`}>
            {documentStatusLabel(document.status)}
          </span>
          <span className="admin-tag admin-tag-muted">{visibilityLabel(document.visibility)}</span>
        </div>
        <dl className="admin-doc-meta">
          <div>
            <dt>Grupo propietario</dt>
            <dd>{groupName}</dd>
          </div>
          <div>
            <dt>Creado</dt>
            <dd>{dateTime(document.created_at)}</dd>
          </div>
          <div>
            <dt>Actualizado</dt>
            <dd>{dateTime(document.updated_at)}</dd>
          </div>
          <div>
            <dt>Vigencia</dt>
            <dd>
              {dateOnly(document.effective_from)} — {dateOnly(document.effective_until)}
            </dd>
          </div>
          <div>
            <dt>Tamaño</dt>
            <dd>{formatBytes(document.size_bytes)}</dd>
          </div>
          <div>
            <dt>Fragmentos indexados</dt>
            <dd>{currentVersion?.chunk_count ?? 0}</dd>
          </div>
          <div>
            <dt>Versión publicada</dt>
            <dd>
              {document.published_version_id
                ? `v${versions.find((version) => version.id === document.published_version_id)?.version ?? "?"}`
                : "Sin publicar"}
            </dd>
          </div>
        </dl>
      </section>

      {document.processing_error ? (
        <p className="admin-message admin-message-error" role="alert">
          Error de procesamiento: {document.processing_error}
        </p>
      ) : null}

      {document.review_notes ? (
        <section className="admin-panel admin-panel-note">
          <h2>Notas de revisión</h2>
          <p>{document.review_notes}</p>
        </section>
      ) : null}

      <section className="admin-panel">
        <h2>Archivos y extracción</h2>
        <p>
          El original se conserva privado. El texto procesado alimenta los fragmentos
          con embeddings y se usa para responder con trazabilidad a la versión.
        </p>
        <div className="admin-actions">
          {originalUrl ? (
            <a className="admin-button admin-button-secondary" href={originalUrl} target="_blank" rel="noreferrer">
              Abrir original
            </a>
          ) : (
            <span className="admin-muted">Original no disponible</span>
          )}
          {processedUrl ? (
            <a className="admin-button admin-button-secondary" href={processedUrl} target="_blank" rel="noreferrer">
              Abrir texto extraído
            </a>
          ) : (
            <span className="admin-muted">Texto extraído no disponible</span>
          )}
          <span className="admin-muted">
            {currentVersion
              ? `${currentVersion.chunk_count} fragmentos · ${formatBytes(currentVersion.size_bytes)}`
              : "Sin versión actual"}
          </span>
        </div>
      </section>

      <section className="admin-panel">
        <h2>Revisión y publicación</h2>
        <p>
          La aprobación habilita la publicación. Publicar exige que la versión tenga
          fragmentos indexados. Puedes cargar una nueva versión sin retirar la vigente:
          la versión publicada sigue disponible hasta que publiques la nueva.
        </p>
        <div className="admin-review-grid">
          {canApprove ? (
            <ApproveDocumentForm documentId={document.id} notes={document.review_notes} />
          ) : null}
          {canReject ? <RejectDocumentForm documentId={document.id} /> : null}
          {canPublish ? <PublishDocumentForm documentId={document.id} /> : null}
          {canRetire ? <RetireDocumentForm documentId={document.id} /> : null}
          {canReprocess ? <ReprocessDocumentForm documentId={document.id} /> : null}
        </div>
        {!canApprove && !canReject && !canPublish && !canRetire && !canReprocess ? (
          <p className="admin-muted">No hay acciones de revisión disponibles para este estado.</p>
        ) : null}
      </section>

      <section className="admin-panel">
        <h2>Metadatos</h2>
        <MetadataForm document={document} />
      </section>

      <section className="admin-panel">
        <h2>Acceso</h2>
        <p>
          Los documentos restringidos solo se comparten con los grupos seleccionados.
          La visibilidad común se limita a documentos aprobados o publicados.
        </p>
        <AccessForm
          documentId={document.id}
          visibility={document.visibility}
          accessGroupIds={accessGroupIds}
          groups={groups.map((item) => ({ id: item.id, name: item.name }))}
        />
      </section>

      {canCreateVersion ? (
        <section className="admin-panel">
          <h2>Nueva versión</h2>
          <p>
            Cargar una nueva versión conserva el historial y devuelve la versión nueva a
            revisión. La versión publicada anterior sigue disponible hasta que publiques
            la nueva.
          </p>
          <NewVersionForm documentId={document.id} />
        </section>
      ) : null}

      <section className="admin-panel">
        <h2>Historial de versiones</h2>
        {versions.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Estado</th>
                  <th>Fragmentos</th>
                  <th>Creada</th>
                  <th>Archivos</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td>
                      v{version.version}
                      {version.version === document.version ? (
                        <span className="admin-subtle">Actual</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`admin-tag admin-tag-${documentStatusTone(version.status)}`}>
                        {documentStatusLabel(version.status)}
                      </span>
                    </td>
                    <td>{version.chunk_count}</td>
                    <td>{dateTime(version.created_at)}</td>
                    <td>
                      <span className="admin-code-cell">
                        {version.original_url ? (
                          <a href={version.original_url} target="_blank" rel="noreferrer">
                            Original
                          </a>
                        ) : (
                          <span className="admin-muted">—</span>
                        )}
                        {version.processed_url ? (
                          <a href={version.processed_url} target="_blank" rel="noreferrer">
                            Extraído
                          </a>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No hay versiones registradas.</p>
        )}
      </section>

      <section className="admin-panel">
        <h2>Eventos</h2>
        {events.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Fecha</th>
                  <th>Actor</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{EVENT_LABELS[event.event_type] ?? event.event_type}</td>
                    <td>{dateTime(event.created_at)}</td>
                    <td>
                      <code>{event.actor_id ? event.actor_id.slice(0, 8) : "sistema"}</code>
                    </td>
                    <td>
                      {event.metadata && Object.keys(event.metadata).length ? (
                        <details>
                          <summary>Ver</summary>
                          <pre className="admin-json">{JSON.stringify(event.metadata, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="admin-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No hay eventos registrados.</p>
        )}
      </section>
    </main>
  );
}
