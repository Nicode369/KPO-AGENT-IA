import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAnswerOutcome } from "@/lib/agent/outcome";
import {
  ABSTENTION_TEXT,
  OUT_OF_SCOPE_TEXT,
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

export const RETRIEVAL_LIMIT = 8;
export const MIN_SIMILARITY = 0.2;
export const RATE_LIMIT_PER_MINUTE = 20;

export type RunAgentQueryInput = {
  supabase: SupabaseClient;
  token: string;
  userId: string;
  groupIds: string[];
  question: string;
  documentIds?: string[];
  enforceRateLimit?: boolean;
  recordHistory?: boolean;
};

export type RunAgentQueryResult =
  | { ok: true; response: AgentQueryResponse }
  | { ok: false; status: number; code: string; message: string };

export async function runAgentQuery(
  input: RunAgentQueryInput,
): Promise<RunAgentQueryResult> {
  const startedAt = Date.now();
  const question = input.question.trim();
  const groupIds = input.groupIds;
  const persist = input.recordHistory !== false;
  const enforceRateLimit = input.enforceRateLimit !== false;

  if (!question || question.length < 3 || question.length > 1200) {
    await maybeRecordQuery(input, persist, {
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
    return {
      ok: false,
      status: 400,
      code: "invalid_question",
      message: "La pregunta debe tener entre 3 y 1200 caracteres.",
    };
  }

  if (enforceRateLimit) {
    const { count: recentQueries } = await input.supabase
      .from("agent_queries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", input.userId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());

    if ((recentQueries ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      const message =
        "Has realizado demasiadas consultas. Espera un minuto e intenta de nuevo.";
      await maybeRecordQuery(input, persist, {
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
      return { ok: false, status: 429, code: "rate_limited", message };
    }
  }

  const security = classifyQuestion(question);
  if (security) {
    const outcome = security.action === "block" ? "blocked" : "rejected";
    const auditSaved = await maybeRecordQuery(input, persist, {
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

    return {
      ok: true,
      response: {
        answer: security.message,
        abstained: true,
        outcome,
        outcomeReason: security.code,
        sources: [],
        model: "none",
        latencyMs: Date.now() - startedAt,
        auditSaved,
      },
    };
  }

  const baseUrl = process.env.INGEST_WORKER_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    await maybeRecordQuery(input, persist, {
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
    return {
      ok: false,
      status: 503,
      code: "worker_not_configured",
      message: "Falta configurar INGEST_WORKER_URL.",
    };
  }

  const embedding = await requestEmbedding(baseUrl, input.token, question);
  if (!embedding.ok) {
    await maybeRecordQuery(input, persist, {
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
    return {
      ok: false,
      status: embedding.status,
      code: embedding.code,
      message: embedding.message,
    };
  }

  const { data: chunkData, error: chunkError } = await input.supabase.rpc(
    "match_document_chunks",
    {
      p_query_embedding: JSON.stringify(embedding.vector),
      p_match_count: RETRIEVAL_LIMIT,
      p_document_ids: input.documentIds ?? null,
    },
  );

  if (chunkError) {
    console.error("[agent] retrieval failed", {
      code: chunkError.code,
      message: chunkError.message,
    });
    await maybeRecordQuery(input, persist, {
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
    return {
      ok: false,
      status: 502,
      code: "retrieval_failed",
      message: "No fue posible consultar la biblioteca documental.",
    };
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
    const answer = OUT_OF_SCOPE_TEXT;
    const resolution = resolveAnswerOutcome({
      hasSources: false,
      modelAbstained: false,
      hasCitations: false,
    });
    const latencyMs = Date.now() - startedAt;
    const auditSaved = await maybeRecordQuery(input, persist, {
      question,
      answer,
      model: "none",
      promptVersion: PROMPT_VERSION,
      abstained: true,
      outcome: resolution.outcome,
      outcomeReason: resolution.outcomeReason,
      latencyMs,
      groupIds,
      sources: [],
      groundingScore: null,
      controls: retrievalControls,
    });

    return {
      ok: true,
      response: {
        answer,
        abstained: true,
        outcome: resolution.outcome,
        outcomeReason: resolution.outcomeReason,
        sources: [],
        model: "none",
        latencyMs,
        auditSaved,
      },
    };
  }

  const messages = buildMessages(question, sources);
  const chat = await requestChat(baseUrl, input.token, messages);
  if (!chat.ok) {
    await maybeRecordQuery(input, persist, {
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
    return {
      ok: false,
      status: chat.status,
      code: chat.code,
      message: chat.message,
    };
  }

  const outputGuard = inspectAnswer(chat.answer);
  if (outputGuard) {
    const latencyMs = Date.now() - startedAt;
    const auditSaved = await maybeRecordQuery(input, persist, {
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

    return {
      ok: true,
      response: {
        answer: SECURITY_REFUSAL_TEXT,
        abstained: true,
        outcome: "blocked",
        outcomeReason: `output_guard_${outputGuard.code}`,
        sources: [],
        model: chat.model,
        latencyMs,
        auditSaved,
      },
    };
  }

  const citationCheck = validateCitations(chat.answer, sources.length);
  const modelAbstained = isAbstention(chat.answer);
  const hasCitations = citationCheck.citations.length > 0;
  const abstained = modelAbstained || !hasCitations;
  const answer = abstained ? ABSTENTION_TEXT : chat.answer;
  const citedSources = abstained
    ? []
    : sources.filter((source) => citationCheck.citations.includes(source.rank));
  const { outcome, outcomeReason } = resolveAnswerOutcome({
    hasSources: true,
    modelAbstained,
    hasCitations,
  });
  const grounding = averageSimilarity(citedSources.length ? citedSources : sources);

  const latencyMs = Date.now() - startedAt;
  const auditSaved = await maybeRecordQuery(input, persist, {
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

  return {
    ok: true,
    response: {
      answer,
      abstained,
      outcome,
      outcomeReason,
      sources: citedSources,
      model: chat.model,
      latencyMs,
      auditSaved,
    },
  };
}

type QueryRecordInput = {
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
};

async function maybeRecordQuery(
  input: RunAgentQueryInput,
  persist: boolean,
  record: QueryRecordInput,
): Promise<boolean> {
  return persist ? recordQuery(input.supabase, record) : false;
}

async function recordQuery(
  supabase: SupabaseClient,
  input: QueryRecordInput,
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
      status: 502,
      code: "worker_unreachable",
      message: "No fue posible conectar con el servicio de consulta.",
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    vectors?: unknown;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    return {
      ok: false as const,
      status: 502,
      code: "embedding_failed",
      message: payload?.error?.message ?? "No fue posible generar el embedding.",
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
      status: 502,
      code: "embedding_invalid",
      message: "El servicio devolvió un embedding inválido.",
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
      status: 502,
      code: "worker_unreachable",
      message: "No fue posible conectar con el servicio de consulta.",
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
      status: 502,
      code: "generation_failed",
      message: payload?.error?.message ?? "No fue posible generar la respuesta.",
    };
  }

  const answer = typeof payload?.answer === "string" ? payload.answer.trim() : "";
  if (!answer) {
    return {
      ok: false as const,
      status: 502,
      code: "generation_invalid",
      message: "El servicio devolvió una respuesta vacía.",
    };
  }

  return {
    ok: true as const,
    answer,
    model: typeof payload?.model === "string" ? payload.model : "unknown",
  };
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
