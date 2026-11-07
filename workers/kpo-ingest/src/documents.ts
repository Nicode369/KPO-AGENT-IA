import type { SupabaseClient } from "@supabase/supabase-js";

import {
  chunkSettings,
  embeddingModel,
  processedBucket,
  type Env,
} from "./env";
import { HttpError } from "./http";
import { extractPdfMarkdown } from "./ocr";

export interface DocumentRecord {
  id: string;
  group_id: string;
  document_type: string;
  norm_number: string | null;
  title: string;
  version: number;
  version_label: string | null;
  status: string;
  visibility: string;
  published_version_id: string | null;
  effective_from: string | null;
  effective_until: string | null;
  source_hash: string;
  source_bucket: string;
  source_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
}

export interface DocumentVersionRecord {
  id: string;
  document_id: string;
  version: number;
  source_hash: string;
  source_bucket: string;
  source_path: string;
  mime_type: string;
  size_bytes: number;
  status: string;
}

export interface ProcessingResult {
  status: "pending_review";
  chunkCount: number;
  processedPath: string;
  model: string;
}

interface ChunkDraft {
  content: string;
  page: number | null;
  section: string | null;
  article: string | null;
  numeral: string | null;
  tokenCount: number;
}

interface ChunkRow {
  document_id: string;
  version_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  page: number | null;
  section: string | null;
  article: string | null;
  numeral: string | null;
  token_count: number;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export async function processDocument(
  admin: SupabaseClient,
  env: Env,
  document: DocumentRecord,
  version: DocumentVersionRecord,
  actorId: string | null
): Promise<ProcessingResult> {
  await updateStatus(admin, document, version, "processing", null, actorId);

  try {
    const source = await downloadOriginal(admin, version);
    const markdown = await extractMarkdown(env, source, version.mime_type);
    const settings = chunkSettings(env);
    const drafts = chunkMarkdown(markdown, settings.maxChars, settings.overlapChars);

    if (!drafts.length) {
      throw new HttpError(
        422,
        "empty_document",
        "No se pudo extraer texto útil del documento."
      );
    }

    const model = embeddingModel(env);
    const embeddings = await embedTexts(
      env,
      drafts.map((draft) => draft.content)
    );

    const rows: ChunkRow[] = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      rows.push({
        document_id: document.id,
        version_id: version.id,
        chunk_index: index,
        content: draft.content,
        content_hash: await sha256(draft.content),
        page: draft.page,
        section: draft.section,
        article: draft.article,
        numeral: draft.numeral,
        token_count: draft.tokenCount,
        embedding: embeddings[index],
        metadata: { extractor: extractorName(version.mime_type) },
      });
    }

    const bucket = processedBucket(env);
    const processedPath = `processed/${document.group_id}/${document.id}/v${version.version}/extracted.md`;
    await uploadProcessed(admin, bucket, processedPath, markdown);
    await replaceChunks(admin, document.id, version.id, rows);
    await markProcessed(
      admin,
      document,
      version,
      bucket,
      processedPath,
      rows.length,
      actorId
    );

    return {
      status: "pending_review",
      chunkCount: rows.length,
      processedPath,
      model,
    };
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : "No fue posible procesar el documento.";
    await markFailed(admin, document, version, message, actorId);
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "processing_failed", message);
  }
}

async function downloadOriginal(
  admin: SupabaseClient,
  version: DocumentVersionRecord
): Promise<{ bytes: ArrayBuffer; name: string }> {
  const { data, error } = await admin.storage
    .from(version.source_bucket)
    .download(version.source_path);

  if (error || !data) {
    throw new HttpError(
      502,
      "source_download_failed",
      "No fue posible leer el documento original."
    );
  }

  return {
    bytes: await data.arrayBuffer(),
    name: version.source_path.split("/").pop() || `documento-v${version.version}`,
  };
}

async function extractMarkdown(
  env: Env,
  source: { bytes: ArrayBuffer; name: string },
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    try {
      return normalizeMarkdown(await extractPdfMarkdown(env, source.bytes));
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      console.error(
        JSON.stringify({
          service: "kpo-ingest",
          code: "pdf_extraction_failed",
          error: error.message,
        })
      );
      throw error;
    }
  }

  let result: Awaited<ReturnType<Env["AI"]["toMarkdown"]>>;
  try {
    result = await env.AI.toMarkdown(
      {
        name: source.name,
        blob: new Blob([source.bytes], { type: mimeType }),
      },
      {
        conversionOptions: {
          output: { format: "markdown" },
          pdf: { metadata: true },
        },
      }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        service: "kpo-ingest",
        code: "markdown_conversion_failed",
        error: error instanceof Error ? error.message : "unknown",
      })
    );
    throw new HttpError(
      502,
      "extraction_failed",
      "No fue posible extraer el contenido del documento."
    );
  }

  const item = Array.isArray(result) ? result[0] : result;
  if (!item) {
    throw new HttpError(502, "extraction_failed", "El convertidor no devolvió contenido.");
  }

  if (item.format === "error") {
    console.error(
      JSON.stringify({
        service: "kpo-ingest",
        code: "markdown_conversion_error",
        error: item.error,
      })
    );
    throw new HttpError(
      422,
      "extraction_failed",
      "El documento no se pudo convertir a texto. Verifica que no esté protegido o dañado."
    );
  }

  if (typeof item.data !== "string") {
    throw new HttpError(502, "extraction_failed", "El convertidor devolvió contenido inválido.");
  }

  const normalized = normalizeMarkdown(item.data);
  if (!normalized) {
    throw new HttpError(
      422,
      "empty_document",
      "El documento no contiene texto extraíble."
    );
  }

  return normalized;
}

function extractorName(mimeType: string): string {
  return mimeType === "application/pdf"
    ? "unpdf+workers-ai-ocr"
    : "workers-ai-to-markdown";
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkMarkdown(
  markdown: string,
  maxChars: number,
  overlapChars: number
): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let buffer = "";
  let page: number | null = null;
  let section: string | null = null;
  let article: string | null = null;
  let numeral: string | null = null;

  const flush = () => {
    const content = normalizeChunk(buffer);
    if (content) {
      chunks.push({
        content,
        page,
        section,
        article,
        numeral,
        tokenCount: Math.max(1, Math.ceil(content.length / 4)),
      });
    }

    const tail = overlapChars > 0 ? content.slice(-overlapChars).trim() : "";
    buffer = tail;
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();
    const pageMatch =
      line.match(/^#{1,6}\s+(?:page|p[aá]gina)\s+(\d+)\b/i) ??
      line.match(/^(?:page|p[aá]gina)\s+(\d+)\b/i);

    if (pageMatch) {
      flush();
      page = Number(pageMatch[1]);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      const text = heading[2].trim();
      section = text.slice(0, 200);
      article = matchArticle(text) ?? article;
      numeral = matchNumeral(text) ?? numeral;
      buffer = `${text}\n`;
      continue;
    }

    if (!line.trim()) {
      if (buffer && !buffer.endsWith("\n\n")) buffer += "\n";
      continue;
    }

    if (/^<!--.*-->$/.test(line.trim())) continue;

    article = matchArticle(line) ?? article;
    numeral = matchNumeral(line) ?? numeral;

    if (line.length > maxChars) {
      if (buffer.trim()) flush();
      for (let offset = 0; offset < line.length; offset += maxChars) {
        buffer = line.slice(offset, offset + maxChars);
        flush();
      }
      continue;
    }

    if (buffer.trim() && buffer.length + line.length + 1 > maxChars) {
      flush();
    }

    buffer += `${buffer && !buffer.endsWith("\n") ? "\n" : ""}${line}`;
  }

  flush();
  return chunks;
}

function normalizeChunk(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function matchArticle(value: string): string | null {
  const match = value.match(
    /(?:art[ií]culo|art\.)\s*([0-9A-Za-zÁÉÍÓÚÑáéíóúñ.\-]+)/i
  );
  return match?.[1]?.slice(0, 50) ?? null;
}

function matchNumeral(value: string): string | null {
  const match = value.match(/(?:numeral|num\.?)\s*([0-9A-Za-z.\-]+)/i);
  return match?.[1]?.slice(0, 50) ?? null;
}

export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  const model = embeddingModel(env);
  const embeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += 32) {
    const batch = texts.slice(index, index + 32);
    let result: unknown;
    try {
      result = await env.AI.run(model, { text: batch });
    } catch {
      throw new HttpError(
        502,
        "ai_request_failed",
        "No fue posible generar los embeddings."
      );
    }

    const data = (result as { data?: unknown }).data;
    if (!Array.isArray(data) || data.length !== batch.length) {
      throw new HttpError(
        502,
        "ai_response_invalid",
        "La respuesta del modelo de embeddings no es válida."
      );
    }

    for (const vector of data) {
      if (!Array.isArray(vector) || vector.length !== 1024) {
        throw new HttpError(
          502,
          "ai_response_invalid",
          "El modelo devolvió vectores con una dimensión inesperada."
        );
      }
      embeddings.push(vector as number[]);
    }
  }

  return embeddings;
}

async function uploadProcessed(
  admin: SupabaseClient,
  bucket: string,
  path: string,
  markdown: string
): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(path, markdown, {
    contentType: "text/markdown",
    cacheControl: "private, max-age=0",
    upsert: true,
  });

  if (error) {
    if (
      String(error.statusCode) === "404" ||
      /bucket not found/i.test(error.message)
    ) {
      throw new HttpError(
        503,
        "processed_bucket_missing",
        `Falta el bucket privado ${bucket}.`
      );
    }

    throw new HttpError(
      502,
      "processed_upload_failed",
      "No fue posible guardar el texto procesado."
    );
  }
}

async function replaceChunks(
  admin: SupabaseClient,
  documentId: string,
  versionId: string,
  rows: ChunkRow[]
): Promise<void> {
  const { error: deleteError } = await admin
    .from("document_chunks")
    .delete()
    .eq("version_id", versionId);

  if (deleteError) {
    throw new HttpError(
      502,
      "chunks_delete_failed",
      "No fue posible reemplazar los fragmentos anteriores."
    );
  }

  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100);
    const { error } = await admin.from("document_chunks").insert(batch);
    if (error) {
      console.error(
        JSON.stringify({
          service: "kpo-ingest",
          code: "chunks_insert_failed",
          document_id: documentId,
          detail: error.message,
        })
      );
      throw new HttpError(
        502,
        "chunks_insert_failed",
        "No fue posible indexar los fragmentos del documento."
      );
    }
  }
}

async function updateStatus(
  admin: SupabaseClient,
  document: DocumentRecord,
  version: DocumentVersionRecord,
  status: "processing",
  error: string | null,
  actorId: string | null
): Promise<void> {
  const { error: documentError } = await admin
    .from("documents")
    .update({ status, processing_error: error, updated_at: new Date().toISOString() })
    .eq("id", document.id);

  if (documentError) {
    throw new HttpError(
      502,
      "document_status_failed",
      "No fue posible actualizar el estado del documento."
    );
  }

  const { error: versionError } = await admin
    .from("document_versions")
    .update({ status, processing_error: error })
    .eq("id", version.id);

  if (versionError) {
    throw new HttpError(
      502,
      "version_status_failed",
      "No fue posible actualizar el estado de la versión."
    );
  }

  await recordEvent(admin, document.id, version.id, "processing", actorId, {});
}

async function markProcessed(
  admin: SupabaseClient,
  document: DocumentRecord,
  version: DocumentVersionRecord,
  bucket: string,
  path: string,
  chunkCount: number,
  actorId: string | null
): Promise<void> {
  const now = new Date().toISOString();
  const { error: versionError } = await admin
    .from("document_versions")
    .update({
      status: "pending_review",
      extracted_bucket: bucket,
      extracted_path: path,
      chunk_count: chunkCount,
      processing_error: null,
      processed_at: now,
    })
    .eq("id", version.id);

  if (versionError) {
    throw new HttpError(
      502,
      "version_status_failed",
      "No fue posible guardar el resultado del procesamiento."
    );
  }

  const { error: documentError } = await admin
    .from("documents")
    .update({
      status: "pending_review",
      processing_error: null,
      updated_at: now,
    })
    .eq("id", document.id);

  if (documentError) {
    throw new HttpError(
      502,
      "document_status_failed",
      "No fue posible actualizar el documento procesado."
    );
  }

  await recordEvent(admin, document.id, version.id, "processed", actorId, {
    chunk_count: chunkCount,
    extracted_path: path,
  });
}

async function markFailed(
  admin: SupabaseClient,
  document: DocumentRecord,
  version: DocumentVersionRecord,
  message: string,
  actorId: string | null
): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("documents")
    .update({ status: "error", processing_error: message, updated_at: now })
    .eq("id", document.id);
  await admin
    .from("document_versions")
    .update({ status: "error", processing_error: message })
    .eq("id", version.id);
  await recordEvent(admin, document.id, version.id, "error", actorId, {
    message,
  });
}

async function recordEvent(
  admin: SupabaseClient,
  documentId: string,
  versionId: string,
  eventType: string,
  actorId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.from("document_events").insert({
    document_id: documentId,
    version_id: versionId,
    event_type: eventType,
    actor_id: actorId,
    metadata,
  });

  if (error) {
    console.error(
      JSON.stringify({
        service: "kpo-ingest",
        code: "event_insert_failed",
        document_id: documentId,
        event_type: eventType,
      })
    );
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
