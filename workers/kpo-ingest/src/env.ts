import { HttpError } from "./http";

export interface Env {
  AI: Ai;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AI_PROVIDER?: string;
  AI_EMBEDDING_MODEL?: string;
  AI_CHAT_MODEL?: string;
  AI_OCR_MODEL?: string;
  SUPABASE_ORIGINAL_BUCKET?: string;
  SUPABASE_PROCESSED_BUCKET?: string;
  MAX_UPLOAD_BYTES?: string;
  CHUNK_MAX_CHARS?: string;
  CHUNK_OVERLAP_CHARS?: string;
  OCR_MIN_TEXT_CHARS?: string;
  ALLOWED_ORIGINS?: string;
}

export const DEFAULT_EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const DEFAULT_CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const DEFAULT_OCR_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";
export const DEFAULT_OCR_MIN_TEXT_CHARS = 40;
export const DEFAULT_ORIGINAL_BUCKET = "documents-original";
export const DEFAULT_PROCESSED_BUCKET = "documents-processed";
export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const DEFAULT_CHUNK_MAX_CHARS = 1400;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 200;

export function embeddingModel(env: Env): string {
  return env.AI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

export function chatModel(env: Env): string {
  return env.AI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

export function ocrModel(env: Env): string {
  return env.AI_OCR_MODEL?.trim() || DEFAULT_OCR_MODEL;
}

export function ocrMinTextChars(env: Env): number {
  const value = Number(env.OCR_MIN_TEXT_CHARS);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 2000) : DEFAULT_OCR_MIN_TEXT_CHARS;
}

export function originalBucket(env: Env): string {
  return env.SUPABASE_ORIGINAL_BUCKET?.trim() || DEFAULT_ORIGINAL_BUCKET;
}

export function processedBucket(env: Env): string {
  return env.SUPABASE_PROCESSED_BUCKET?.trim() || DEFAULT_PROCESSED_BUCKET;
}

export function maxUploadBytes(env: Env): number {
  const value = Number(env.MAX_UPLOAD_BYTES);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_UPLOAD_BYTES;
}

export function chunkSettings(env: Env): {
  maxChars: number;
  overlapChars: number;
} {
  const maxChars = Number(env.CHUNK_MAX_CHARS);
  const overlapChars = Number(env.CHUNK_OVERLAP_CHARS);
  const safeMaxChars =
    Number.isFinite(maxChars) && maxChars >= 300
      ? Math.min(maxChars, 4000)
      : DEFAULT_CHUNK_MAX_CHARS;
  const safeOverlap =
    Number.isFinite(overlapChars) && overlapChars >= 0
      ? Math.min(overlapChars, 800, Math.floor(safeMaxChars / 2))
      : DEFAULT_CHUNK_OVERLAP_CHARS;

  return {
    maxChars: safeMaxChars,
    overlapChars: safeOverlap,
  };
}

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function requireSupabaseConfig(env: Env): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const rawUrl = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawUrl || !anonKey || !serviceRoleKey) {
    throw new HttpError(
      503,
      "supabase_not_configured",
      "Falta configurar SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HttpError(
      503,
      "supabase_url_invalid",
      "SUPABASE_URL no es una URL válida."
    );
  }

  const local =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
    throw new HttpError(
      503,
      "supabase_url_invalid",
      "SUPABASE_URL debe usar HTTPS fuera de un entorno local."
    );
  }

  return {
    url: parsed.origin,
    anonKey,
    serviceRoleKey,
  };
}
