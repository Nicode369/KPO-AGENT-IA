import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminGroup } from "./data";

export type AdminDocumentStatus =
  | "uploaded"
  | "processing"
  | "pending_review"
  | "approved"
  | "published"
  | "retired"
  | "rejected"
  | "error";

export type AdminDocumentVisibility = "restricted" | "common";

export type AdminDocumentRecord = {
  id: string;
  group_id: string;
  document_type: string;
  norm_number: string | null;
  title: string;
  version: number;
  version_label: string | null;
  status: AdminDocumentStatus;
  visibility: AdminDocumentVisibility;
  effective_from: string | null;
  effective_until: string | null;
  source_hash: string;
  source_bucket: string;
  source_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_version_id: string | null;
  published_at: string | null;
  retired_at: string | null;
  review_notes: string | null;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminDocumentRow = AdminDocumentRecord & {
  group_name: string;
};

export type AdminDocumentVersion = {
  id: string;
  document_id: string;
  version: number;
  source_hash: string;
  source_bucket: string;
  source_path: string;
  mime_type: string;
  size_bytes: number;
  extracted_bucket: string | null;
  extracted_path: string | null;
  chunk_count: number;
  status: AdminDocumentStatus;
  processing_error: string | null;
  created_by: string | null;
  created_at: string;
  processed_at: string | null;
  original_url: string | null;
  processed_url: string | null;
};

export type AdminDocumentEvent = {
  id: string;
  document_id: string;
  version_id: string | null;
  event_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AdminDocumentDetail = {
  document: AdminDocumentRecord;
  groupName: string;
  versions: AdminDocumentVersion[];
  events: AdminDocumentEvent[];
  currentVersion: AdminDocumentVersion | null;
  originalUrl: string | null;
  processedUrl: string | null;
  accessGroupIds: string[];
};

const statusLabels: Record<AdminDocumentStatus, string> = {
  uploaded: "Cargado",
  processing: "Procesando",
  pending_review: "En revisión",
  approved: "Aprobado",
  published: "Publicado",
  retired: "Retirado",
  rejected: "Rechazado",
  error: "Error",
};

const typeLabels: Record<string, string> = {
  ley: "Ley",
  decreto: "Decreto",
  resolucion: "Resolución",
  circular: "Circular",
  acuerdo: "Acuerdo",
  concepto: "Concepto",
  guia: "Guía",
  manual: "Manual",
  politica: "Política",
  protocolo: "Protocolo",
  otro: "Otro",
};

export function documentStatusLabel(status: string): string {
  return statusLabels[status as AdminDocumentStatus] ?? status;
}

export function documentStatusTone(
  status: string,
): "ok" | "warn" | "error" | "muted" {
  if (status === "published" || status === "approved") return "ok";
  if (status === "pending_review" || status === "processing") return "warn";
  if (status === "error" || status === "rejected") return "error";
  return "muted";
}

export function documentTypeLabel(type: string): string {
  return (
    typeLabels[type] ??
    type.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())
  );
}

export function visibilityLabel(visibility: string): string {
  return visibility === "common" ? "Común a grupos activos" : "Restringido";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export async function getAdminDocuments(
  supabase: SupabaseClient,
  groups: AdminGroup[],
  options: { q?: string; status?: string; groupId?: string } = {},
): Promise<AdminDocumentRow[]> {
  const groupIds = groups.map((group) => group.id);
  if (!groupIds.length) return [];

  let query = supabase
    .from("documents")
    .select("*")
    .in("group_id", groupIds)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (options.groupId && groupIds.includes(options.groupId)) {
    query = query.eq("group_id", options.groupId);
  }
  if (options.status && options.status in statusLabels) {
    query = query.eq("status", options.status);
  }
  if (options.q?.trim()) {
    const term = options.q.trim().replace(/[%_]/g, "\\$&");
    query = query.ilike("title", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  return ((data ?? []) as AdminDocumentRecord[]).map((document) => ({
    ...document,
    group_name: groupNames.get(document.group_id) ?? "Grupo",
  }));
}

export function sumCurrentVersionChunks(
  documents: Array<Pick<AdminDocumentRecord, "id" | "version">>,
  versions: Array<
    Pick<AdminDocumentVersion, "document_id" | "version" | "chunk_count">
  >,
): number {
  const currentVersions = new Map(
    documents.map((document) => [document.id, document.version]),
  );

  return versions.reduce(
    (total, version) =>
      version.version === currentVersions.get(version.document_id)
        ? total + version.chunk_count
        : total,
    0,
  );
}

export async function getAdminDocumentChunkTotal(
  supabase: SupabaseClient,
  groups: AdminGroup[],
): Promise<number> {
  const groupIds = groups.map((group) => group.id);
  if (!groupIds.length) return 0;

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, version")
    .in("group_id", groupIds);

  if (documentsError) throw new Error(documentsError.message);

  const ids = (documents ?? []).map((document) => document.id);
  if (!ids.length) return 0;

  const { data: versions, error: versionsError } = await supabase
    .from("document_versions")
    .select("document_id, version, chunk_count")
    .in("document_id", ids);

  if (versionsError) throw new Error(versionsError.message);

  return sumCurrentVersionChunks(documents ?? [], versions ?? []);
}

export async function getAdminDocumentDetail(
  supabase: SupabaseClient,
  documentId: string,
): Promise<AdminDocumentDetail | null> {
  const { data: documentData, error: documentError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) throw new Error(documentError.message);
  if (!documentData) return null;

  const document = documentData as AdminDocumentRecord;
  const [groupResult, versionsResult, eventsResult, accessResult] =
    await Promise.all([
      supabase
        .from("groups")
        .select("name")
        .eq("id", document.group_id)
        .maybeSingle<{ name: string }>(),
      supabase
        .from("document_versions")
        .select("*")
        .eq("document_id", documentId)
        .order("version", { ascending: false })
        .limit(30),
      supabase
        .from("document_events")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("document_access")
        .select("group_id")
        .eq("document_id", documentId),
    ]);

  if (versionsResult.error) throw new Error(versionsResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (accessResult.error) throw new Error(accessResult.error.message);

  const versions = await Promise.all(
    ((versionsResult.data ?? []) as Omit<
      AdminDocumentVersion,
      "original_url" | "processed_url"
    >[]).map(async (version) => ({
      ...version,
      original_url: await signedUrl(
        supabase,
        version.source_bucket,
        version.source_path,
      ),
      processed_url: version.extracted_bucket && version.extracted_path
        ? await signedUrl(
            supabase,
            version.extracted_bucket,
            version.extracted_path,
          )
        : null,
    })),
  );

  const currentVersion =
    versions.find((version) => version.version === document.version) ?? null;

  return {
    document,
    groupName: groupResult.data?.name ?? "Grupo",
    versions,
    events: (eventsResult.data ?? []) as AdminDocumentEvent[],
    currentVersion,
    originalUrl: currentVersion?.original_url ?? null,
    processedUrl: currentVersion?.processed_url ?? null,
    accessGroupIds: (accessResult.data ?? []).map(
      (row: { group_id: string }) => row.group_id,
    ),
  };
}

async function signedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
