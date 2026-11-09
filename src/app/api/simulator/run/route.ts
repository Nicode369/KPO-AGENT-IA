import { NextResponse } from "next/server";

import { recordAuditEvent } from "@/lib/audit/log";
import { runAgentQuery } from "@/lib/agent/run";
import type { AgentQueryResponse } from "@/lib/agent/types";
import { getApiWorkspace, type ApiWorkspace } from "@/lib/auth/api";
import { canAccessSimulator } from "@/lib/auth/simulator";
import { evaluateAgentResponse, summarizeSimulatorResults } from "@/lib/simulator/metrics";
import type { SimulatorExpectedOutcome, SimulatorResult } from "@/lib/simulator/types";

export const maxDuration = 60;

const MAX_CASES_PER_RUN = 25;

type RunBody =
  | { action: "start"; groupId: string; caseIds: string[] }
  | { action: "case"; runId: string; caseId: string }
  | { action: "finish"; runId: string };

type SimulatorCaseSnapshot = {
  id: string;
  group_id: string;
  title: string;
  question: string;
  expected_outcome: SimulatorExpectedOutcome;
  expected_document_id: string | null;
  expected_terms: string[] | null;
};

type SimulatorRunRow = {
  id: string;
  group_id: string;
  created_by: string;
  status: string;
  total_cases: number;
  completed_cases: number;
  metadata: Record<string, unknown> | null;
};

export async function POST(request: Request) {
  const context = await getApiWorkspace();
  if (!context.ok) return fail(context.status, context.code, context.message);
  if (!canAccessSimulator(context.value.isSuperadmin, context.value.memberships)) {
    return fail(403, "forbidden", "No tienes acceso al simulador.");
  }

  let body: RunBody;
  try {
    body = (await request.json()) as RunBody;
  } catch {
    return fail(400, "invalid_json", "El cuerpo de la solicitud no es válido.");
  }

  if (!body || typeof body !== "object" || !("action" in body)) {
    return fail(400, "invalid_action", "Acción inválida.");
  }

  if (body.action === "start") return startRun(context.value, body);
  if (body.action === "case") return runCase(context.value, body);
  if (body.action === "finish") return finishRun(context.value, body);
  return fail(400, "invalid_action", "Acción inválida.");
}

async function startRun(
  context: ApiWorkspace,
  body: { groupId: string; caseIds: string[] },
) {
  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  const caseIds = Array.isArray(body.caseIds)
    ? [...new Set(body.caseIds.filter((value): value is string => typeof value === "string"))]
    : [];

  if (!canAccessGroup(context, groupId)) {
    return fail(403, "forbidden", "No tienes acceso a ese grupo.");
  }
  if (!caseIds.length || caseIds.length > MAX_CASES_PER_RUN) {
    return fail(
      400,
      "invalid_cases",
      `Selecciona entre 1 y ${MAX_CASES_PER_RUN} casos.`,
    );
  }

  const { data: cases, error: casesError } = await context.supabase
    .from("simulator_cases")
    .select(
      "id, group_id, title, question, expected_outcome, expected_document_id, expected_terms",
    )
    .eq("group_id", groupId)
    .eq("is_active", true)
    .in("id", caseIds);

  if (casesError) {
    return fail(500, "cases_failed", "No se pudieron cargar los casos.");
  }

  const snapshots = (cases ?? []) as SimulatorCaseSnapshot[];
  if (snapshots.length !== caseIds.length) {
    return fail(
      400,
      "cases_mismatch",
      "Alguno de los casos ya no existe, está inactivo o pertenece a otro grupo.",
    );
  }

  const { data: run, error: runError } = await context.supabase
    .from("simulator_runs")
    .insert({
      group_id: groupId,
      created_by: context.userId,
      status: "running",
      total_cases: snapshots.length,
      completed_cases: 0,
      metadata: { case_ids: snapshots.map((item) => item.id) },
    })
    .select("id")
    .single<{ id: string }>();

  if (runError) {
    return fail(500, "run_failed", "No se pudo iniciar la ejecución.");
  }

  await recordAuditEvent({
    eventType: "simulator_run_started",
    actorId: context.userId,
    actorEmail: context.profile.email,
    groupId,
    targetType: "simulator_run",
    targetId: run.id,
    metadata: { total_cases: snapshots.length, case_ids: snapshots.map((item) => item.id) },
  });

  return NextResponse.json({
    runId: run.id,
    cases: snapshots.map((item) => ({
      id: item.id,
      title: item.title,
      question: item.question,
    })),
  });
}

async function runCase(
  context: ApiWorkspace,
  body: { runId: string; caseId: string },
) {
  const runId = typeof body.runId === "string" ? body.runId : "";
  const caseId = typeof body.caseId === "string" ? body.caseId : "";
  if (!runId || !caseId) return fail(400, "invalid_case", "Caso inválido.");

  const run = await getOwnedRun(context, runId);
  if (!run.ok) return fail(run.status, run.code, run.message);

  const { data: caseData, error: caseError } = await context.supabase
    .from("simulator_cases")
    .select(
      "id, group_id, title, question, expected_outcome, expected_document_id, expected_terms",
    )
    .eq("id", caseId)
    .eq("group_id", run.value.group_id)
    .maybeSingle<SimulatorCaseSnapshot>();

  if (caseError) return fail(500, "case_failed", "No se pudo cargar el caso.");
  if (!caseData) return fail(404, "case_not_found", "El caso no existe.");

  const { data: existing } = await context.supabase
    .from("simulator_results")
    .select("id")
    .eq("run_id", runId)
    .eq("case_id", caseId)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return fail(409, "case_already_run", "Ese caso ya fue ejecutado en este lote.");
  }

  const { data: groupDocuments, error: documentsError } = await context.supabase
    .from("documents")
    .select("id")
    .eq("group_id", run.value.group_id);
  if (documentsError) {
    return fail(500, "documents_failed", "No se pudieron cargar los documentos del grupo.");
  }

  const agent = await runAgentQuery({
    supabase: context.supabase,
    token: context.token,
    userId: context.userId,
    groupIds: [run.value.group_id],
    question: caseData.question,
    documentIds: (groupDocuments ?? []).map((document) => document.id),
    enforceRateLimit: false,
    recordHistory: false,
  });

  const expectedTerms = caseData.expected_terms ?? [];
  const result = agent.ok
    ? buildResultFromResponse(caseData, expectedTerms, agent.response)
    : buildResultFromError(caseData, expectedTerms, agent.code, agent.message);

  const { data: saved, error: saveError } = await context.supabase
    .from("simulator_results")
    .insert({
      run_id: runId,
      group_id: run.value.group_id,
      case_id: caseData.id,
      ...result,
    })
    .select("*")
    .single<SimulatorResult>();

  if (saveError) {
    return fail(500, "result_failed", "No se pudo guardar el resultado.");
  }

  const completed = Math.min(run.value.total_cases, run.value.completed_cases + 1);
  const { error: updateError } = await context.supabase
    .from("simulator_runs")
    .update({ completed_cases: completed })
    .eq("id", runId);

  if (updateError) {
    console.error("[simulator] run progress update failed", {
      message: updateError.message,
    });
  }

  return NextResponse.json({ result: normalizeResult(saved) });
}

async function finishRun(
  context: ApiWorkspace,
  body: { runId: string },
) {
  const runId = typeof body.runId === "string" ? body.runId : "";
  if (!runId) return fail(400, "invalid_run", "Ejecución inválida.");

  const run = await getOwnedRun(context, runId);
  if (!run.ok) return fail(run.status, run.code, run.message);

  const { data: resultData, error: resultsError } = await context.supabase
    .from("simulator_results")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (resultsError) {
    return fail(500, "results_failed", "No se pudieron cargar los resultados.");
  }

  const results = (resultData ?? []).map(normalizeResult);
  const metrics = summarizeSimulatorResults(results);
  const status = results.length >= run.value.total_cases ? "completed" : "failed";

  const { error: updateError } = await context.supabase
    .from("simulator_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      completed_cases: results.length,
      metadata: {
        ...(run.value.metadata ?? {}),
        metrics,
      },
    })
    .eq("id", runId);

  if (updateError) return fail(500, "run_finish_failed", "No se pudo cerrar la ejecución.");

  await recordAuditEvent({
    eventType:
      status === "completed"
        ? "simulator_run_completed"
        : "simulator_run_failed",
    actorId: context.userId,
    actorEmail: context.profile.email,
    groupId: run.value.group_id,
    targetType: "simulator_run",
    targetId: runId,
    metadata: { status, metrics },
  });

  return NextResponse.json({ status, metrics, results });
}

async function getOwnedRun(context: ApiWorkspace, runId: string) {
  const { data, error } = await context.supabase
    .from("simulator_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle<SimulatorRunRow>();

  if (error) {
    return { ok: false as const, status: 500, code: "run_failed", message: "No se pudo consultar la ejecución." };
  }
  if (!data) {
    return { ok: false as const, status: 404, code: "run_not_found", message: "La ejecución no existe." };
  }
  if (data.created_by !== context.userId || !canAccessGroup(context, data.group_id)) {
    return { ok: false as const, status: 403, code: "forbidden", message: "No tienes acceso a esa ejecución." };
  }
  return { ok: true as const, value: data };
}

function canAccessGroup(context: ApiWorkspace, groupId: string): boolean {
  return (
    context.isSuperadmin ||
    context.memberships.some(
      (membership) =>
        membership.group_id === groupId &&
        ["group_admin", "supervisor"].includes(membership.role),
    )
  );
}

function buildResultFromResponse(
  caseData: SimulatorCaseSnapshot,
  expectedTerms: string[],
  response: AgentQueryResponse,
) {
  const evaluation = evaluateAgentResponse({
    expectedOutcome: caseData.expected_outcome,
    expectedDocumentId: caseData.expected_document_id,
    expectedTerms,
    response,
  });

  return {
    case_title: caseData.title,
    question: caseData.question,
    expected_outcome: caseData.expected_outcome,
    actual_outcome: response.outcome,
    outcome_match: evaluation.outcomeMatch,
    expected_document_id: caseData.expected_document_id,
    source_match: evaluation.sourceMatch,
    expected_terms: expectedTerms,
    terms_match: evaluation.termsMatch,
    answer: response.answer,
    abstained: response.abstained,
    citation_count: evaluation.citationCount,
    latency_ms: response.latencyMs,
    error: null,
    sources: response.sources.map((source) => ({
      document_id: source.document_id,
      title: source.title,
      rank: source.rank,
    })),
  };
}

function buildResultFromError(
  caseData: SimulatorCaseSnapshot,
  expectedTerms: string[],
  code: string,
  message: string,
) {
  return {
    case_title: caseData.title,
    question: caseData.question,
    expected_outcome: caseData.expected_outcome,
    actual_outcome: "error" as const,
    outcome_match: caseData.expected_outcome === "error",
    expected_document_id: caseData.expected_document_id,
    source_match: null,
    expected_terms: expectedTerms,
    terms_match: false,
    answer: message,
    abstained: true,
    citation_count: 0,
    latency_ms: null,
    error: `${code}: ${message}`,
    sources: [],
  };
}

function normalizeResult(row: SimulatorResult): SimulatorResult {
  return {
    ...row,
    expected_terms: row.expected_terms ?? [],
    sources: row.sources ?? [],
  };
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
