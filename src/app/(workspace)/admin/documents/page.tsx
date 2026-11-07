import Link from "next/link";
import { connection } from "next/server";

import { requireAdminUser } from "@/lib/auth/workspace";
import { getAdminGroups } from "@/lib/admin/data";
import {
  documentStatusLabel,
  documentStatusTone,
  documentTypeLabel,
  formatBytes,
  getAdminDocumentChunkTotal,
  getAdminDocuments,
} from "@/lib/admin/documents";
import { UploadDocumentForm } from "./document-forms";

export const instant = false;

const STATUS_OPTIONS = [
  ["", "Todos los estados"],
  ["uploaded", "Cargado"],
  ["processing", "Procesando"],
  ["pending_review", "En revisión"],
  ["approved", "Aprobado"],
  ["published", "Publicado"],
  ["rejected", "Rechazado"],
  ["retired", "Retirado"],
  ["error", "Error"],
] as const;

type SearchParams = Promise<{
  q?: string;
  status?: string;
  group?: string;
}>;

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await searchParams;
  const { supabase, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);
  const query = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const group = typeof params.group === "string" ? params.group : "";

  let documents: Awaited<ReturnType<typeof getAdminDocuments>> = [];
  let totalChunks = 0;
  let loadError: string | null = null;

  try {
    [documents, totalChunks] = await Promise.all([
      getAdminDocuments(supabase, groups, {
        q: query,
        status,
        groupId: group,
      }),
      getAdminDocumentChunkTotal(supabase, groups),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  const migrationMissing = Boolean(
    loadError &&
      /public\.documents|could not find the table|schema cache/i.test(loadError),
  );
  const pendingReview = documents.filter(
    (document) => document.status === "pending_review",
  ).length;
  const published = documents.filter(
    (document) => document.status === "published",
  ).length;
  const hasFilters = Boolean(query || status || group);

  return (
    <main className="admin-content">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Gestión documental</p>
          <h1>Documentos</h1>
          <p className="workspace-lead">
            Carga normas privadas, revisa el texto extraído, valida los fragmentos
            indexados y publica solo las versiones aprobadas.
          </p>
        </div>
        {groups.length ? (
          <Link className="admin-button admin-button-secondary" href="#cargar">
            Cargar documento
          </Link>
        ) : null}
      </div>

      {migrationMissing ? (
        <section className="admin-panel admin-panel-warning">
          <h2>Falta aplicar la migración documental</h2>
          <p>
            Ejecuta <code>web/supabase/migrations/202611100001_documents_and_ingestion.sql</code>{" "}
            en el SQL Editor de Supabase. Luego recarga esta página.
          </p>
        </section>
      ) : null}

      {loadError && !migrationMissing ? (
        <p className="admin-message admin-message-error" role="alert">
          No se pudieron cargar los documentos: {loadError}
        </p>
      ) : null}

      {!migrationMissing ? (
        <>
          <section className="admin-stats" aria-label="Resumen documental">
            <div className="admin-stat">
              <span>Documentos</span>
              <strong>{documents.length}</strong>
              <small>Visibles para tu perfil</small>
            </div>
            <div className="admin-stat">
              <span>En revisión</span>
              <strong>{pendingReview}</strong>
              <small>Pendientes de aprobación</small>
            </div>
            <div className="admin-stat">
              <span>Publicados</span>
              <strong>{published}</strong>
              <small>Disponibles para consulta</small>
            </div>
            <div className="admin-stat">
              <span>Fragmentos indexados</span>
              <strong>{totalChunks}</strong>
              <small>Total en la biblioteca</small>
            </div>
          </section>

          <section className="admin-panel" id="cargar">
            <h2>Cargar documento</h2>
            {groups.length ? (
              <UploadDocumentForm
                groups={groups.map((item) => ({ id: item.id, name: item.name }))}
              />
            ) : (
              <p>No administras grupos activos. Crea un grupo o pide acceso.</p>
            )}
          </section>

          <section className="admin-panel">
            <h2>Biblioteca documental</h2>
            <form className="admin-filter" method="get">
              <div className="admin-field">
                <label htmlFor="filter-q">Buscar</label>
                <input
                  id="filter-q"
                  name="q"
                  defaultValue={query}
                  placeholder="Título del documento"
                />
              </div>
              <div className="admin-field">
                <label htmlFor="filter-status">Estado</label>
                <select id="filter-status" name="status" defaultValue={status}>
                  {STATUS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {groups.length > 1 ? (
                <div className="admin-field">
                  <label htmlFor="filter-group">Grupo</label>
                  <select id="filter-group" name="group" defaultValue={group}>
                    <option value="">Todos los grupos</option>
                    {groups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="admin-filter-actions">
                <button type="submit">Filtrar</button>
                {hasFilters ? (
                  <Link className="admin-button admin-button-secondary" href="/admin/documents">
                    Limpiar
                  </Link>
                ) : null}
              </div>
            </form>

            {documents.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table admin-table-wide">
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Grupo</th>
                      <th>Versión</th>
                      <th>Estado</th>
                      <th>Tamaño</th>
                      <th>Actualizado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <Link className="admin-doc-link" href={`/admin/documents/${document.id}`}>
                            {document.title}
                          </Link>
                          <span className="admin-subtle">
                            {documentTypeLabel(document.document_type)}
                            {document.norm_number ? ` · ${document.norm_number}` : ""}
                          </span>
                          {document.processing_error ? (
                            <span className="admin-error-text">{document.processing_error}</span>
                          ) : null}
                        </td>
                        <td>{document.group_name}</td>
                        <td>
                          v{document.version}
                          {document.version_label ? (
                            <span className="admin-subtle">{document.version_label}</span>
                          ) : null}
                        </td>
                        <td>
                          <span className={`admin-tag admin-tag-${documentStatusTone(document.status)}`}>
                            {documentStatusLabel(document.status)}
                          </span>
                        </td>
                        <td>{formatBytes(document.size_bytes)}</td>
                        <td>{new Date(document.updated_at).toLocaleDateString("es-CO")}</td>
                        <td>
                          <Link className="admin-button admin-button-secondary" href={`/admin/documents/${document.id}`}>
                            Revisar
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty">
                <p>
                  {hasFilters
                    ? "No hay documentos que coincidan con el filtro."
                    : "Todavía no hay documentos en tus grupos."}
                </p>
                {!hasFilters && groups.length ? (
                  <Link className="admin-button" href="#cargar">
                    Cargar el primero
                  </Link>
                ) : null}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
