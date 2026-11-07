import type { SupabaseClient } from "@supabase/supabase-js";

import {
  authenticate,
  requireDocumentManager,
  requireGroupAdmin,
} from "./auth";
import {
  allowedOrigins,
  chatModel,
  chunkSettings,
  embeddingModel,
  maxUploadBytes,
  ocrModel,
  originalBucket,
  processedBucket,
  type Env,
} from "./env";
import {
  embedTexts,
  processDocument,
  type DocumentRecord,
  type DocumentVersionRecord,
} from "./documents";
import { validateDocumentFile } from "./files";
import { errorResponse, HttpError, jsonResponse } from "./http";

const SERVICE = "kpo-ingest";
const VERSION = "0.2.0";
interface DocumentMetadata {
  title: string | null;
  normNumber: string | null;
  versionLabel: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
}

interface ProcessingErrorBody {
  state: "error";
  code: string;
  message: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    try {
      assertAllowedOrigin(request, env);

      if (request.method === "OPTIONS") {
        return preflightResponse(request);
      }

      const processMatch = pathname.match(
        /^\/documents\/([^/]+)\/process$/
      );
      const versionsMatch = pathname.match(
        /^\/documents\/([^/]+)\/versions$/
      );

      let response: Response;

      if (request.method === "GET" && pathname === "/health") {
        response = handleHealth(env, requestId);
      } else if (request.method === "POST" && pathname === "/embed-test") {
        response = await handleEmbedTest(request, env, requestId);
      } else if (request.method === "POST" && pathname === "/embed") {
        response = await handleEmbed(request, env, requestId);
      } else if (request.method === "POST" && pathname === "/chat") {
        response = await handleChat(request, env, requestId);
      } else if (request.method === "POST" && pathname === "/ingest") {
        response = await handleIngest(request, env, requestId);
      } else if (
        request.method === "POST" &&
        processMatch
      ) {
        response = await handleProcess(
          request,
          env,
          requestId,
          processMatch[1]
        );
      } else if (
        request.method === "POST" &&
        versionsMatch
      ) {
        response = await handleNewVersion(
          request,
          env,
          requestId,
          versionsMatch[1]
        );
      } else {
        throw new HttpError(404, "not_found", "Ruta no encontrada.");
      }

      return withCors(response, request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return withCors(errorResponse(error, requestId), request, env);
      }

      console.error(
        JSON.stringify({
          service: SERVICE,
          request_id: requestId,
          code: "internal_error",
        })
      );

      return withCors(
        jsonResponse(
          500,
          {
            error: {
              code: "internal_error",
              message: "Error interno del servicio.",
              request_id: requestId,
            },
          },
          requestId
        ),
        request,
        env
      );
    }
  },
} satisfies ExportedHandler<Env>;

function handleHealth(env: Env, requestId: string): Response {
  const chunk = chunkSettings(env);
  return jsonResponse(
    200,
    {
      ok: true,
      service: SERVICE,
      version: VERSION,
      timestamp: new Date().toISOString(),
      bindings: {
        ai: Boolean(env.AI),
        supabase: Boolean(
          env.SUPABASE_URL &&
            env.SUPABASE_ANON_KEY &&
            env.SUPABASE_SERVICE_ROLE_KEY
        ),
      },
      embedding_model: embeddingModel(env),
      chat_model: chatModel(env),
      ocr_model: ocrModel(env),
      original_bucket: originalBucket(env),
      processed_bucket: processedBucket(env),
      chunking: chunk,
    },
    requestId
  );
}

async function handleEmbedTest(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  await authenticate(request, env);
  const payload = await readJson(request);
  const texts = normalizeTexts(payload);
  const model = embeddingModel(env);
  const startedAt = Date.now();

  let result: unknown;
  try {
    result = await env.AI.run(model, { text: texts });
  } catch {
    throw new HttpError(
      502,
      "ai_request_failed",
      "No fue posible generar los embeddings."
    );
  }

  const vectors = (result as { data?: unknown }).data;
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new HttpError(
      502,
      "ai_response_invalid",
      "La respuesta del modelo de embeddings no es válida."
    );
  }

  const first = vectors[0];
  if (!Array.isArray(first) || first.length === 0) {
    throw new HttpError(
      502,
      "ai_response_invalid",
      "El modelo no devolvió vectores."
    );
  }

  return jsonResponse(
    200,
    {
      provider: "cloudflare",
      model,
      count: texts.length,
      dimensions: first.length,
      latency_ms: Date.now() - startedAt,
    },
    requestId
  );
}

async function handleEmbed(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  await authenticate(request, env);
  const payload = await readJson(request);
  const texts = normalizeTexts(payload);
  const model = embeddingModel(env);
  const startedAt = Date.now();
  const vectors = await embedTexts(env, texts);

  return jsonResponse(
    200,
    {
      provider: "cloudflare",
      model,
      count: vectors.length,
      dimensions: vectors[0]?.length ?? 0,
      vectors,
      latency_ms: Date.now() - startedAt,
    },
    requestId
  );
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function handleChat(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  await authenticate(request, env);
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "invalid_payload", "El cuerpo no es válido.");
  }

  const body = payload as {
    messages?: unknown;
    max_tokens?: unknown;
    temperature?: unknown;
  };
  const messages = normalizeMessages(body.messages);
  const maxTokens = normalizeInteger(body.max_tokens, 1200, 128, 4096);
  const temperature = normalizeNumber(body.temperature, 0.1, 0, 1);
  const model = chatModel(env);
  const startedAt = Date.now();

  let result: unknown;
  try {
    result = await env.AI.run(model, {
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(model.startsWith("@cf/google/gemma-4-")
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        service: SERVICE,
        request_id: requestId,
        code: "chat_request_failed",
        error: error instanceof Error ? error.message : "unknown",
      })
    );
    throw new HttpError(
      502,
      "ai_request_failed",
      "No fue posible generar la respuesta."
    );
  }

  const answer = chatResponseText(result);
  if (!answer) {
    throw new HttpError(
      502,
      "ai_response_invalid",
      "El modelo no devolvió una respuesta válida."
    );
  }

  const usage =
    result && typeof result === "object"
      ? ((result as { usage?: unknown }).usage ?? null)
      : null;

  return jsonResponse(
    200,
    {
      provider: "cloudflare",
      model,
      answer,
      usage,
      latency_ms: Date.now() - startedAt,
    },
    requestId
  );
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    throw new HttpError(
      400,
      "invalid_messages",
      "Envía entre 1 y 12 mensajes."
    );
  }

  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      throw new HttpError(400, "invalid_messages", "Mensaje inválido.");
    }
    const record = item as { role?: unknown; content?: unknown };
    if (
      record.role !== "system" &&
      record.role !== "user" &&
      record.role !== "assistant"
    ) {
      throw new HttpError(400, "invalid_messages", "Rol de mensaje inválido.");
    }
    if (typeof record.content !== "string" || !record.content.trim()) {
      throw new HttpError(400, "invalid_messages", "Contenido de mensaje inválido.");
    }
    if (record.content.length > 24000) {
      throw new HttpError(400, "invalid_messages", "Mensaje demasiado largo.");
    }
    messages.push({ role: record.role, content: record.content });
  }
  return messages;
}

function normalizeInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function chatResponseText(result: unknown): string {
  if (typeof result === "string") return result.trim();
  if (!result || typeof result !== "object") return "";

  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.result === "string") return record.result.trim();
  if (typeof record.text === "string") return record.text.trim();

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0] as {
      message?: { content?: unknown };
      text?: unknown;
    };
    if (typeof choice?.message?.content === "string") {
      return choice.message.content.trim();
    }
    if (typeof choice?.text === "string") return choice.text.trim();
  }

  return "";
}

async function handleIngest(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const context = await authenticate(request, env);
  const maxBytes = maxUploadBytes(env);
  assertContentLength(request, maxBytes);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(
      415,
      "multipart_required",
      "La carga debe usar multipart/form-data."
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(
      400,
      "invalid_form_data",
      "No fue posible leer el formulario."
    );
  }

  const groupId = requiredTextField(form, "group_id", "Falta el grupo.");
  const documentType = requiredTextField(
    form,
    "document_type",
    "El tipo documental no es válido."
  );
  const file = form.get("file");

  if (!/^[a-z][a-z0-9_]{1,63}$/.test(documentType)) {
    throw new HttpError(
      400,
      "invalid_document_type",
      "El tipo documental no es válido."
    );
  }

  if (!(file instanceof File)) {
    throw new HttpError(400, "missing_file", "Falta el archivo.");
  }

  const metadata = readDocumentMetadata(form);
  const groupContext = await requireGroupAdmin(context, groupId);
  const validated = await validateDocumentFile(file, maxBytes);
  await assertDocumentsSchema(groupContext.admin);

  const bucket = originalBucket(env);
  const objectPath = `originals/${groupContext.group.id}/${validated.sha256}.${validated.extension}`;

  await uploadOriginal(groupContext.admin, bucket, objectPath, validated);

  const documentId = crypto.randomUUID();
  const { data: inserted, error: insertError } = await groupContext.admin
    .from("documents")
    .insert({
      id: documentId,
      group_id: groupContext.group.id,
      document_type: documentType,
      norm_number: metadata.normNumber,
      title: metadata.title ?? validated.title,
      version: 1,
      version_label: metadata.versionLabel,
      status: "uploaded",
      effective_from: metadata.effectiveFrom,
      effective_until: metadata.effectiveUntil,
      source_hash: validated.sha256,
      source_bucket: bucket,
      source_path: objectPath,
      mime_type: validated.contentType,
      size_bytes: validated.size,
      uploaded_by: context.user.id,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    await groupContext.admin.storage.from(bucket).remove([objectPath]);

    if (insertError?.code === "23505") {
      throw new HttpError(
        409,
        "duplicate_document",
        "El documento ya está registrado en este grupo."
      );
    }

    throw new HttpError(
      502,
      "document_insert_failed",
      "No fue posible registrar el documento."
    );
  }

  const document = inserted as DocumentRecord;
  const version = await insertVersion(
    groupContext.admin,
    document,
    1,
    validated,
    context.user.id,
    bucket,
    objectPath
  );

  if (!version) {
    await groupContext.admin.storage.from(bucket).remove([objectPath]);
    await groupContext.admin.from("documents").delete().eq("id", document.id);
    throw new HttpError(
      502,
      "version_insert_failed",
      "No fue posible registrar la versión inicial."
    );
  }

  const processing = await processOrCapture(
    groupContext.admin,
    env,
    document,
    version,
    context.user.id
  );

  return jsonResponse(
    201,
    {
      document: summarizeDocument(document, processing),
      version: summarizeVersion(version),
      processing,
    },
    requestId
  );
}

async function handleProcess(
  request: Request,
  env: Env,
  requestId: string,
  documentId: string
): Promise<Response> {
  const context = await authenticate(request, env);
  const documentContext = await requireDocumentManager(context, documentId);
  const document = documentContext.document;

  if (document.status === "processing") {
    throw new HttpError(
      409,
      "processing_in_progress",
      "El documento ya se está procesando."
    );
  }

  if (document.status === "approved" || document.status === "published") {
    throw new HttpError(
      409,
      "version_required",
      "Un documento aprobado o publicado debe procesarse como nueva versión."
    );
  }

  if (document.status === "retired") {
    throw new HttpError(
      409,
      "document_retired",
      "El documento está retirado. Carga una nueva versión."
    );
  }

  const version = await currentVersion(documentContext.admin, document);
  const result = await processDocument(
    documentContext.admin,
    env,
    document,
    version,
    context.user.id
  );

  return jsonResponse(
    200,
    {
      document_id: document.id,
      status: result.status,
      chunk_count: result.chunkCount,
      processed_path: result.processedPath,
      model: result.model,
    },
    requestId
  );
}

async function handleNewVersion(
  request: Request,
  env: Env,
  requestId: string,
  documentId: string
): Promise<Response> {
  const context = await authenticate(request, env);
  const documentContext = await requireDocumentManager(context, documentId);
  const document = documentContext.document;
  const admin = documentContext.admin;

  if (document.status === "processing") {
    throw new HttpError(
      409,
      "processing_in_progress",
      "Espera a que termine el procesamiento de la versión actual."
    );
  }

  const maxBytes = maxUploadBytes(env);
  assertContentLength(request, maxBytes);
  const form = await readMultipart(request);
  const file = form.get("file");

  if (!(file instanceof File)) {
    throw new HttpError(400, "missing_file", "Falta el archivo.");
  }

  const metadata = readDocumentMetadata(form);
  const validated = await validateDocumentFile(file, maxBytes);
  await assertDocumentsSchema(admin);

  const effectiveFrom = metadata.effectiveFrom ?? document.effective_from;
  const effectiveUntil = metadata.effectiveUntil ?? document.effective_until;
  assertDateRange(effectiveFrom, effectiveUntil);

  const { data: latest, error: latestError } = await admin
    .from("document_versions")
    .select("version")
    .eq("document_id", document.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new HttpError(
      503,
      "version_lookup_failed",
      "No fue posible calcular la nueva versión."
    );
  }

  const nextVersion = ((latest?.version as number | undefined) ?? document.version) + 1;
  const bucket = originalBucket(env);
  const objectPath = `originals/${document.group_id}/${document.id}/v${nextVersion}/${validated.sha256}.${validated.extension}`;

  await uploadOriginal(admin, bucket, objectPath, validated);

  const version = await insertVersion(
    admin,
    document,
    nextVersion,
    validated,
    context.user.id,
    bucket,
    objectPath
  );

  if (!version) {
    await admin.storage.from(bucket).remove([objectPath]);
    throw new HttpError(
      502,
      "version_insert_failed",
      "No fue posible registrar la nueva versión."
    );
  }

  const now = new Date().toISOString();
  // Keep documents.source_* and published_version_id pointing at the currently
  // published version. They are synchronized when the new version is published.
  const updates: Record<string, unknown> = {
    version: nextVersion,
    status: "uploaded",
    approved_by: null,
    approved_at: null,
    retired_at: null,
    review_notes: null,
    processing_error: null,
    updated_at: now,
  };

  if (metadata.title !== null) updates.title = metadata.title;
  if (metadata.normNumber !== null) updates.norm_number = metadata.normNumber;
  if (metadata.versionLabel !== null) {
    updates.version_label = metadata.versionLabel;
  }
  if (metadata.effectiveFrom !== null || metadata.effectiveUntil !== null) {
    updates.effective_from = effectiveFrom;
    updates.effective_until = effectiveUntil;
  }

  const { data: updated, error: updateError } = await admin
    .from("documents")
    .update(updates)
    .eq("id", document.id)
    .select("*")
    .single();

  if (updateError || !updated) {
    await admin.from("document_versions").delete().eq("id", version.id);
    await admin.storage.from(bucket).remove([objectPath]);

    if (updateError?.code === "23505") {
      throw new HttpError(
        409,
        "duplicate_document",
        "El archivo ya está registrado en este grupo."
      );
    }

    throw new HttpError(
      502,
      "document_update_failed",
      "No fue posible actualizar el documento."
    );
  }

  const updatedDocument = updated as DocumentRecord;
  await admin.from("document_events").insert({
    document_id: document.id,
    version_id: version.id,
    event_type: "version_created",
    actor_id: context.user.id,
    metadata: { version: nextVersion },
  });

  const processing = await processOrCapture(
    admin,
    env,
    updatedDocument,
    version,
    context.user.id
  );

  return jsonResponse(
    201,
    {
      document: summarizeDocument(updatedDocument, processing),
      version: summarizeVersion(version),
      processing,
    },
    requestId
  );
}

async function insertVersion(
  admin: SupabaseClient,
  document: DocumentRecord,
  version: number,
  validated: Awaited<ReturnType<typeof validateDocumentFile>>,
  actorId: string | null,
  bucket: string,
  sourcePath: string
): Promise<DocumentVersionRecord | null> {
  const { data, error } = await admin
    .from("document_versions")
    .insert({
      document_id: document.id,
      version,
      source_hash: validated.sha256,
      source_bucket: bucket,
      source_path: sourcePath,
      mime_type: validated.contentType,
      size_bytes: validated.size,
      status: "uploaded",
      created_by: actorId,
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return data as DocumentVersionRecord;
}

async function currentVersion(
  admin: SupabaseClient,
  document: DocumentRecord
): Promise<DocumentVersionRecord> {
  const { data, error } = await admin
    .from("document_versions")
    .select("*")
    .eq("document_id", document.id)
    .eq("version", document.version)
    .maybeSingle();

  if (error) {
    throw new HttpError(
      503,
      "version_lookup_failed",
      "No fue posible leer la versión actual."
    );
  }

  if (!data) {
    throw new HttpError(
      409,
      "version_missing",
      "No se encontró la versión actual del documento."
    );
  }

  return data as DocumentVersionRecord;
}

async function processOrCapture(
  admin: SupabaseClient,
  env: Env,
  document: DocumentRecord,
  version: DocumentVersionRecord,
  actorId: string | null
): Promise<
  | {
      state: "pending_review";
      chunk_count: number;
      processed_path: string;
      model: string;
    }
  | ProcessingErrorBody
> {
  try {
    const result = await processDocument(admin, env, document, version, actorId);
    return {
      state: "pending_review",
      chunk_count: result.chunkCount,
      processed_path: result.processedPath,
      model: result.model,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      return { state: "error", code: error.code, message: error.message };
    }

    return {
      state: "error",
      code: "processing_failed",
      message: "No fue posible procesar el documento.",
    };
  }
}

function summarizeDocument(
  document: DocumentRecord,
  processing: Awaited<ReturnType<typeof processOrCapture>>
) {
  return {
    id: document.id,
    group_id: document.group_id,
    document_type: document.document_type,
    norm_number: document.norm_number,
    title: document.title,
    version: document.version,
    version_label: document.version_label,
    status:
      processing.state === "pending_review" ? "pending_review" : "error",
    effective_from: document.effective_from,
    effective_until: document.effective_until,
    mime_type: document.mime_type,
    size_bytes: document.size_bytes,
    source_hash: document.source_hash,
  };
}

function summarizeVersion(version: DocumentVersionRecord) {
  return {
    id: version.id,
    document_id: version.document_id,
    version: version.version,
    status: version.status,
    mime_type: version.mime_type,
    size_bytes: version.size_bytes,
    source_hash: version.source_hash,
  };
}

async function uploadOriginal(
  admin: SupabaseClient,
  bucket: string,
  objectPath: string,
  validated: Awaited<ReturnType<typeof validateDocumentFile>>
): Promise<void> {
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(objectPath, validated.bytes, {
      contentType: validated.contentType,
      cacheControl: "private, max-age=0",
      upsert: false,
    });

  if (!uploadError) return;

  if (
    String(uploadError.statusCode) === "404" ||
    /bucket not found/i.test(uploadError.message)
  ) {
    throw new HttpError(
      503,
      "storage_bucket_missing",
      `Falta el bucket privado ${bucket}.`
    );
  }

  if (
    String(uploadError.statusCode) === "409" ||
    /already exists|duplicate/i.test(uploadError.message)
  ) {
    throw new HttpError(
      409,
      "duplicate_document",
      "El documento ya fue cargado en este grupo."
    );
  }

  throw new HttpError(
    502,
    "storage_upload_failed",
    "No fue posible guardar el documento original."
  );
}

async function assertDocumentsSchema(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from("documents").select("id").limit(1);

  if (!error) {
    return;
  }

  if (
    error.code === "PGRST205" ||
    /could not find the table 'public\.documents'/i.test(error.message)
  ) {
    throw new HttpError(
      503,
      "documents_schema_missing",
      "Falta aplicar la migración documental de la fase 4."
    );
  }

  throw new HttpError(
    503,
    "documents_schema_unavailable",
    "No fue posible validar el esquema documental."
  );
}

function readDocumentMetadata(form: FormData): DocumentMetadata {
  const title = optionalTextField(form, "title", 300);
  const normNumber = optionalTextField(form, "norm_number", 80);
  const versionLabel = optionalTextField(form, "version_label", 80);
  const effectiveFrom = optionalDateField(form, "effective_from");
  const effectiveUntil = optionalDateField(form, "effective_until");
  assertDateRange(effectiveFrom, effectiveUntil);

  return { title, normNumber, versionLabel, effectiveFrom, effectiveUntil };
}

function requiredTextField(
  form: FormData,
  name: string,
  message: string
): string {
  const value = form.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `missing_${name}`, message);
  }
  return value.trim();
}

function optionalTextField(
  form: FormData,
  name: string,
  maxLength: number
): string | null {
  const raw = form.get(name);
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new HttpError(400, `invalid_${name}`, `El campo ${name} no es válido.`);
  }

  const value = raw.trim();
  if (!value) return null;
  if (value.length > maxLength) {
    throw new HttpError(
      400,
      `invalid_${name}`,
      `El campo ${name} supera ${maxLength} caracteres.`
    );
  }

  return value;
}

function optionalDateField(form: FormData, name: string): string | null {
  const value = optionalTextField(form, name, 10);
  if (!value) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(
      400,
      `invalid_${name}`,
      "La fecha debe usar el formato AAAA-MM-DD."
    );
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `invalid_${name}`, "La fecha no es válida.");
  }

  return value;
}

function assertDateRange(from: string | null, until: string | null): void {
  if (from && until && until < from) {
    throw new HttpError(
      400,
      "invalid_effective_range",
      "La fecha final no puede ser anterior a la inicial."
    );
  }
}

async function readMultipart(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(
      415,
      "multipart_required",
      "La carga debe usar multipart/form-data."
    );
  }

  try {
    return await request.formData();
  } catch {
    throw new HttpError(
      400,
      "invalid_form_data",
      "No fue posible leer el formulario."
    );
  }
}

function assertAllowedOrigin(request: Request, env: Env): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  if (!allowedOrigins(env).includes(origin)) {
    throw new HttpError(403, "origin_not_allowed", "Origen no autorizado.");
  }
}

function preflightResponse(request: Request): Response {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  });

  if (origin) {
    headers.set("access-control-allow-origin", origin);
  }

  return new Response(null, { status: 204, headers });
}

function withCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(env).includes(origin)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-expose-headers", "x-request-id");
  headers.set("vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

function assertContentLength(request: Request, maxBytes: number): void {
  const header = request.headers.get("content-length");
  if (!header) {
    return;
  }

  const length = Number(header);
  if (Number.isFinite(length) && length > maxBytes + 1024 * 1024) {
    throw new HttpError(
      413,
      "file_too_large",
      `El archivo supera el límite de ${maxBytes} bytes.`
    );
  }
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "json_required",
      "La solicitud debe usar application/json."
    );
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "El JSON no es válido.");
  }
}

function normalizeTexts(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || !("text" in payload)) {
    throw new HttpError(400, "missing_text", "Falta el campo text.");
  }

  const raw = (payload as { text: unknown }).text;
  const values =
    typeof raw === "string"
      ? [raw]
      : Array.isArray(raw) && raw.every((item) => typeof item === "string")
        ? raw
        : null;

  if (!values || values.length === 0 || values.length > 32) {
    throw new HttpError(
      400,
      "invalid_text",
      "Envía entre 1 y 32 textos."
    );
  }

  const texts = values.map((value) => value.trim());
  if (texts.some((value) => value.length === 0 || value.length > 8000)) {
    throw new HttpError(
      400,
      "invalid_text",
      "Cada texto debe tener entre 1 y 8000 caracteres."
    );
  }

  return texts;
}
