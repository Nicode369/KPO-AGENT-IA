import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  ABSTENTION_TEXT,
  PROMPT_VERSION,
  buildMessages,
  buildSources,
  isAbstention,
  validateCitations,
} from "@/lib/agent/prompt";
import {
  SECURITY_REFUSAL_TEXT,
  classifyQuestion,
  inspectAnswer,
} from "@/lib/agent/security";
import type {
  AgentOutcome,
  AgentQueryResponse,
  AgentSource,
  RetrievedChunk,
} from "@/lib/agent/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

type WorkspaceContext = {
  userId: string;
  memberships: { group_id: string }[];
  isSuperadmin: boolean;
  token: string;
};

type ProfileRow = {
  id: string;
  is_active: boolean;
  is_superadmin: boolean;
  sessions_revoked_at: string | null;
};

const RETRIEVAL_LIMIT = 8;
const MIN_SIMILARITY = 0.2;
const RATE_LIMIT_PER_MINUTE = 20;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return fail(503, "not_configured", "La aplicación no está configurada.");
  }

  const supabase = await createClient();
  const context = await workspaceContext(supabase);
  if (!context.ok) return context.response;

  const startedAt = Date.now();
  const groupIds = context.value.memberships.map(
    (membership) => membership.group_id,
  );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_json", "El cuerpo de la solicitud no es válido.");
  }

  const question =
    body &&
    typeof body === "object" &&
    typeof (body as { question?: unknown }).question === "string"
      ? (body as { question: string }).question.trim()
      : "";

  if (!question) {
    return fail(
      400,
      "invalid_question",
      "La pregunta debe tener entre 3 y 1200 caracteres.",
    );
  }

  if (question.length < 3 || question.length > 1200) {
    await recordQuery(supabase, {
      question: question.slice(0, 1200),
      answer: null,
      model: "none",
      promptVersion: null,
      abstained: true,
      outcome: "blocked",
      outcomeReason: "invalid_question",
      latencyMs: Date.now() - startedAt,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: { input_validation: true },
    });

    return fail(
      400,
      "invalid_question",
      "La pregunta debe tener entre 3 y 1200 caracteres.",
    );
  }

  const { count: recentQueries } = await supabase
    .from("agent_queries")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", context.value.userId)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());

  if ((recentQueries ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    const message =
      "Has realizado demasiadas consultas. Espera un minuto e intenta de nuevo.";
    await recordQuery(supabase, {
      question,
      answer: message,
      model: "none",
      promptVersion: null,
      abstained: true,
      outcome: "blocked",
      outcomeReason: "rate_limited",
      latencyMs: Date.now() - startedAt,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: { rate_limit_per_minute: RATE_LIMIT_PER_MINUTE },
    });

    return fail(429, "rate_limited", message);
  }

  const security = classifyQuestion(question);
  if (security) {
    const outcome = security.action === "block" ? "blocked" : "rejected";
    const auditSaved = await recordQuery(supabase, {
      question,
      answer: security.message,
      model: "none",
      promptVersion: null,
      abstained: true,
      outcome,
      outcomeReason: security.code,
      latencyMs: Date.now() - startedAt,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: {
        security_filter: true,
        security_action: security.action,
        security_severity: security.severity,
      },
    });

    return NextResponse.json({
      answer: security.message,
      abstained: true,
      outcome,
      outcomeReason: security.code,
      sources: [],
      model: "none",
      latencyMs: Date.now() - startedAt,
      auditSaved,
    } satisfies AgentQueryResponse);
  }

  const baseUrl = process.env.INGEST_WORKER_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    await recordQuery(supabase, {
      question,
      answer: null,
      model: "none",
      promptVersion: null,
      abstained: false,
      outcome: "error",
      outcomeReason: "worker_not_configured",
      latencyMs: Date.now() - startedAt,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: {},
    });

    return fail(
      503,
      "worker_not_configured",
      "Falta configurar INGEST_WORKER_URL.",
    );
  }

  const embedding = await requestEmbedding(
    baseUrl,
    context.value.token,
    question,
  );
  if (!embedding.ok) {
    await recordQuery(supabase, {
      question,
      answer: null,
      model: "none",
      promptVersion: null,
      abstained: false,
      outcome: "error",
      outcomeReason: "embedding_failed",
      latencyMs: Date.now() - startedAt,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: {},
    });
    return embedding.response;
  }

  const { data: chunkData, error: chunkError } = await supabase.rpc(
    "match_document_chunks",
    {
      p_query_embedding: JSON.stringify(embedding.vector),
      p_match_count: RETRIEVAL_LIMIT,
    },
  );

  if (chunkError) {
    console.error("[agent] retrieval failed", {
      code: chunkError.code,
      message: chunkError.message,
    });
    await recordQuery(supabase, {
      question,
      answer: null,
      model: "none",
      promptVersion: null,
      abstained: false,
      outcome: "error",
      outcomeReason: "retrieval_failed",
      latencyMs: Date.now() - startedAt,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: {},
    });
    return fail(
      502,
      "retrieval_failed",
      "No fue posible consultar la biblioteca documental.",
    );
  }

  const chunks = ((chunkData ?? []) as RetrievedChunk[]).filter(
    (chunk) =>
      typeof chunk.content === "string" &&
      chunk.content.trim().length > 0 &&
      Number(chunk.similarity) >= MIN_SIMILARITY,
  );

  const sources = buildSources(chunks);
  const retrievalControls = {
    retrieval_top_k: RETRIEVAL_LIMIT,
    min_similarity: MIN_SIMILARITY,
  };

  if (!sources.length) {
    const answer = ABSTENTION_TEXT;
    const latencyMs = Date.now() - startedAt;
    const auditSaved = await recordQuery(supabase, {
      question,
      answer,
      model: "none",
      promptVersion: PROMPT_VERSION,
      abstained: true,
      outcome: "insufficient_evidence",
      outcomeReason: "no_authorized_sources",
      latencyMs,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: retrievalControls,
    });

    return NextResponse.json({
      answer,
      abstained: true,
      outcome: "insufficient_evidence",
      outcomeReason: "no_authorized_sources",
      sources: [],
      model: "none",
      latencyMs,
      auditSaved,
    } satisfies AgentQueryResponse);
  }

  const messages = buildMessages(question, sources);
  const chat = await requestChat(baseUrl, context.value.token, messages);
  if (!chat.ok) {
    await recordQuery(supabase, {
      question,
      answer: null,
      model: "none",
      promptVersion: PROMPT_VERSION,
      abstained: false,
      outcome: "error",
      outcomeReason: "generation_failed",
      latencyMs: Date.now() - startedAt,
      groupIds,
      sources,
      groundingScore: null,
      controls: retrievalControls,
    });
    return chat.response;
  }

  const outputGuard = inspectAnswer(chat.answer);
  if (outputGuard) {
    const latencyMs = Date.now() - startedAt;
    const auditSaved = await recordQuery(supabase, {
      question,
      answer: SECURITY_REFUSAL_TEXT,
      model: chat.model,
      promptVersion: PROMPT_VERSION,
      abstained: true,
      outcome: "blocked",
      outcomeReason: `output_guard_${outputGuard.code}`,
      latencyMs,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: {
        ...retrievalControls,
        output_guard: true,
        security_action: "block",
        security_severity: "high",
        output_guard_code: outputGuard.code,
      },
    });

    return NextResponse.json({
      answer: SECURITY_REFUSAL_TEXT,
      abstained: true,
      outcome: "blocked",
      outcomeReason: `output_guard_${outputGuard.code}`,
      sources: [],
      model: chat.model,
      latencyMs,
      auditSaved,
    } satisfies AgentQueryResponse);
  }

  const citationCheck = validateCitations(chat.answer, sources.length);
  const modelAbstained = isAbstention(chat.answer);
  const hasCitations = citationCheck.citations.length > 0;
  const abstained = modelAbstained || !hasCitations;
  const answer = abstained ? ABSTENTION_TEXT : chat.answer;
  const citedSources = abstained
    ? []
    : sources.filter((source) => citationCheck.citations.includes(source.rank));
  const outcome: AgentOutcome = abstained
    ? "insufficient_evidence"
    : "answered";
  const outcomeReason = abstained
    ? modelAbstained
      ? "model_abstained"
      : "citation_validation_failed"
    : null;
  const grounding = averageSimilarity(
    citedSources.length ? citedSources : sources,
  );

  const latencyMs = Date.now() - startedAt;
  const auditSaved = await recordQuery(supabase, {
    question,
    answer,
    model: chat.model,
    promptVersion: PROMPT_VERSION,
    abstained,
    outcome,
    outcomeReason,
    latencyMs,
    groupIds,
    sources: abstained ? sources : citedSources,
    groundingScore: grounding,
    controls: {
      ...retrievalControls,
      citation_validation: true,
      invalid_citations: citationCheck.invalid,
    },
  });

  return NextResponse.json({
    answer,
    abstained,
    outcome,
    outcomeReason,
    sources: citedSources,
    model: chat.model,
    latencyMs,
    auditSaved,
  } satisfies AgentQueryResponse);
}

async function workspaceContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<
  | { ok: true; value: WorkspaceContext }
  | { ok: false; response: NextResponse }
> {
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") {
    return { ok: false, response: fail(401, "unauthenticated", "Inicia sesión.") };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_active, is_superadmin, sessions_revoked_at")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (!profile?.is_active) {
    return {
      ok: false,
      response: fail(403, "inactive_account", "La cuenta no está activa."),
    };
  }

  const issuedAt = Number(claimsData?.claims?.iat ?? 0);
  const revokedAt = profile.sessions_revoked_at
    ? Math.floor(new Date(profile.sessions_revoked_at).getTime() / 1000)
    : 0;
  if (revokedAt > 0 && issuedAt < revokedAt) {
    return {
      ok: false,
      response: fail(401, "session_revoked", "La sesión fue revocada."),
    };
  }

  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!profile.is_superadmin && !memberships?.length) {
    return {
      ok: false,
      response: fail(403, "no_active_group", "No tienes grupos activos."),
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, response: fail(401, "unauthenticated", "Inicia sesión.") };
  }

  return {
    ok: true,
    value: {
      userId,
      memberships: (memberships ?? []) as { group_id: string }[],
      isSuperadmin: profile.is_superadmin,
      token,
    },
  };
}

async function requestEmbedding(baseUrl: string, token: string, question: string) {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/embed`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: [question] }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false as const,
      response: fail(
        502,
        "worker_unreachable",
        "No fue posible conectar con el servicio de consulta.",
      ),
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    vectors?: unknown;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    return {
      ok: false as const,
      response: fail(
        502,
        "embedding_failed",
        payload?.error?.message ?? "No fue posible generar el embedding.",
      ),
    };
  }

  const vector = Array.isArray(payload?.vectors) ? payload.vectors[0] : null;
  if (
    !Array.isArray(vector) ||
    vector.length !== 1024 ||
    !vector.every((value) => typeof value === "number")
  ) {
    return {
      ok: false as const,
      response: fail(
        502,
        "embedding_invalid",
        "El servicio devolvió un embedding inválido.",
      ),
    };
  }

  return { ok: true as const, vector: vector as number[] };
}

async function requestChat(
  baseUrl: string,
  token: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
) {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ messages, max_tokens: 1000, temperature: 0.1 }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false as const,
      response: fail(
        502,
        "worker_unreachable",
        "No fue posible conectar con el servicio de consulta.",
      ),
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    answer?: unknown;
    model?: unknown;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    return {
      ok: false as const,
      response: fail(
        502,
        "generation_failed",
        payload?.error?.message ?? "No fue posible generar la respuesta.",
      ),
    };
  }

  const answer = typeof payload?.answer === "string" ? payload.answer.trim() : "";
  if (!answer) {
    return {
      ok: false as const,
      response: fail(
        502,
        "generation_invalid",
        "El servicio devolvió una respuesta vacía.",
      ),
    };
  }

  return {
    ok: true as const,
    answer,
    model: typeof payload?.model === "string" ? payload.model : "unknown",
  };
}

async function recordQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    question: string;
    answer: string | null;
    model: string;
    promptVersion: string | null;
    abstained: boolean;
    outcome: AgentOutcome;
    outcomeReason: string | null;
    latencyMs: number;
    groupIds: string[];
    sources: AgentSource[];
    groundingScore: number | null;
    controls: Record<string, unknown>;
  },
): Promise<boolean> {
  const { error } = await supabase.rpc("record_agent_query", {
    p_question: input.question,
    p_answer: input.answer,
    p_model: input.model,
    p_prompt_version: input.promptVersion,
    p_abstained: input.abstained,
    p_outcome: input.outcome,
    p_outcome_reason: input.outcomeReason,
    p_latency_ms: input.latencyMs,
    p_group_ids: input.groupIds,
    p_sources: input.sources.map((source) => ({
      chunk_id: source.chunk_id,
      document_id: source.document_id,
      title: source.title,
      version: source.version,
      similarity: source.similarity,
    })),
    p_grounding_score: input.groundingScore,
    p_controls: input.controls,
    p_question_hash: sha256(input.question),
    p_answer_hash: sha256(input.answer),
  });

  if (error) {
    console.error("[agent] audit failed", {
      code: error.code,
      message: error.message,
    });
    return false;
  }

  return true;
}

function averageSimilarity(sources: AgentSource[]): number | null {
  if (!sources.length) return null;
  const total = sources.reduce((sum, source) => sum + source.similarity, 0);
  return total / sources.length;
}

function sha256(value: string | null): string | null {
  if (value === null) return null;
  return createHash("sha256").update(value).digest("hex");
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
