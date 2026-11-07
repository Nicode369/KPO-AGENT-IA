"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/auth/workspace";

export type DocumentActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialDocumentActionState: DocumentActionState = {
  status: "idle",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value || null;
}

function errorState(message: string): DocumentActionState {
  return { status: "error", message };
}

function successState(message: string): DocumentActionState {
  return { status: "success", message };
}

function rpcMessage(
  error: { code?: string; message?: string } | null,
  fallback: string,
): string {
  if (!error) return fallback;
  if (error.code === "42501") return "No tienes autorización para esa acción.";
  if (error.code === "23514") {
    return "El documento no está en un estado válido para esa acción.";
  }
  if (error.code === "23505") {
    return "El archivo ya está registrado en este grupo.";
  }
  if (error.code === "P0002") return "El documento no existe.";
  if (error.code === "22023") return "Los datos enviados no son válidos.";
  return fallback;
}

function revalidateDocument(documentId: string): void {
  revalidatePath("/admin/documents");
  revalidatePath(`/admin/documents/${documentId}`);
}

export async function approveDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const { supabase } = await requireAdminUser();
  const documentId = field(formData, "document_id");
  const notes = optionalField(formData, "notes");

  if (!documentId) return errorState("Documento inválido.");

  const { error } = await supabase.rpc("approve_document", {
    p_document_id: documentId,
    p_notes: notes,
  });

  if (error) {
    return errorState(rpcMessage(error, "No se pudo aprobar el documento."));
  }

  revalidateDocument(documentId);
  return successState("Documento aprobado. Ya puedes publicarlo.");
}

export async function rejectDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const { supabase } = await requireAdminUser();
  const documentId = field(formData, "document_id");
  const reason = field(formData, "reason");

  if (!documentId) return errorState("Documento inválido.");
  if (reason.length < 5) {
    return errorState("Escribe un motivo de al menos 5 caracteres.");
  }

  const { error } = await supabase.rpc("reject_document", {
    p_document_id: documentId,
    p_reason: reason,
  });

  if (error) {
    return errorState(rpcMessage(error, "No se pudo rechazar el documento."));
  }

  revalidateDocument(documentId);
  return successState("Documento rechazado. Puedes corregirlo y reprocesarlo.");
}

export async function publishDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const { supabase } = await requireAdminUser();
  const documentId = field(formData, "document_id");

  if (!documentId) return errorState("Documento inválido.");

  const { error } = await supabase.rpc("publish_document", {
    p_document_id: documentId,
  });

  if (error) {
    return errorState(rpcMessage(error, "No se pudo publicar el documento."));
  }

  revalidateDocument(documentId);
  return successState("Documento publicado y disponible para consulta.");
}

export async function retireDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const { supabase } = await requireAdminUser();
  const documentId = field(formData, "document_id");
  const reason = field(formData, "reason");

  if (!documentId) return errorState("Documento inválido.");
  if (reason.length < 5) {
    return errorState("Escribe un motivo de al menos 5 caracteres.");
  }

  const { error } = await supabase.rpc("retire_document", {
    p_document_id: documentId,
    p_reason: reason,
  });

  if (error) {
    return errorState(rpcMessage(error, "No se pudo retirar el documento."));
  }

  revalidateDocument(documentId);
  return successState("Documento retirado.");
}

export async function reprocessDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const { supabase } = await requireAdminUser();
  const documentId = field(formData, "document_id");
  if (!documentId) return errorState("Documento inválido.");

  const baseUrl = process.env.INGEST_WORKER_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    return errorState("Falta configurar INGEST_WORKER_URL.");
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return errorState("La sesión no es válida. Inicia sesión de nuevo.");

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/documents/${encodeURIComponent(documentId)}/process`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    return errorState("No se pudo conectar con el servicio de ingesta.");
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    chunk_count?: number;
  } | null;

  if (!response.ok) {
    return errorState(
      payload?.error?.message ?? "No se pudo reprocesar el documento.",
    );
  }

  revalidateDocument(documentId);
  return successState(
    `Documento reprocesado en ${payload?.chunk_count ?? 0} fragmentos.`,
  );
}

export async function updateDocumentMetadataAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const { supabase } = await requireAdminUser();
  const documentId = field(formData, "document_id");
  const title = field(formData, "title");
  const documentType = field(formData, "document_type");
  const normNumber = optionalField(formData, "norm_number");
  const versionLabel = optionalField(formData, "version_label");
  const effectiveFrom = optionalField(formData, "effective_from");
  const effectiveUntil = optionalField(formData, "effective_until");

  if (!documentId) return errorState("Documento inválido.");
  if (title.length < 1 || title.length > 300) {
    return errorState("El título debe tener entre 1 y 300 caracteres.");
  }
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(documentType)) {
    return errorState("El tipo documental no es válido.");
  }
  if (effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return errorState("La fecha inicial no es válida.");
  }
  if (effectiveUntil && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveUntil)) {
    return errorState("La fecha final no es válida.");
  }
  if (effectiveFrom && effectiveUntil && effectiveUntil < effectiveFrom) {
    return errorState("La fecha final no puede ser anterior a la inicial.");
  }

  const { error } = await supabase.rpc("update_document_metadata", {
    p_document_id: documentId,
    p_title: title,
    p_document_type: documentType,
    p_norm_number: normNumber,
    p_version_label: versionLabel,
    p_effective_from: effectiveFrom,
    p_effective_until: effectiveUntil,
  });

  if (error) {
    return errorState(rpcMessage(error, "No se pudieron guardar los metadatos."));
  }

  revalidateDocument(documentId);
  return successState("Metadatos actualizados.");
}

export async function setDocumentAccessAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const { supabase } = await requireAdminUser();
  const documentId = field(formData, "document_id");
  const visibility = field(formData, "visibility");
  const groupIds = formData
    .getAll("group_ids")
    .filter((value): value is string => typeof value === "string");

  if (!documentId) return errorState("Documento inválido.");
  if (visibility !== "restricted" && visibility !== "common") {
    return errorState("La visibilidad no es válida.");
  }

  const { error } = await supabase.rpc("set_document_access", {
    p_document_id: documentId,
    p_visibility: visibility,
    p_group_ids: visibility === "common" ? [] : groupIds,
  });

  if (error) {
    return errorState(rpcMessage(error, "No se pudieron actualizar los accesos."));
  }

  revalidateDocument(documentId);
  return successState("Acceso del documento actualizado.");
}
