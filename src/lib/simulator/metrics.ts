import type { AgentQueryResponse } from "@/lib/agent/types";

import type { SimulatorMetrics, SimulatorResult } from "./types";

export type EvaluatedSimulatorResult = {
  outcomeMatch: boolean;
  sourceMatch: boolean | null;
  termsMatch: boolean;
  citationCount: number;
};

export function matchesExpectedTerms(answer: string, terms: string[]): boolean {
  if (!terms.length) return true;
  const normalized = answer.toLocaleLowerCase("es-CO");
  return terms.every((term) =>
    normalized.includes(term.toLocaleLowerCase("es-CO")),
  );
}

export function evaluateAgentResponse(input: {
  expectedOutcome: string;
  expectedDocumentId: string | null;
  expectedTerms: string[];
  response: AgentQueryResponse;
}): EvaluatedSimulatorResult {
  const sourceDocumentIds = input.response.sources.map(
    (source) => source.document_id,
  );
  return {
    outcomeMatch: input.response.outcome === input.expectedOutcome,
    sourceMatch: input.expectedDocumentId
      ? sourceDocumentIds.includes(input.expectedDocumentId)
      : null,
    termsMatch: matchesExpectedTerms(input.response.answer, input.expectedTerms),
    citationCount: input.response.sources.length,
  };
}

export function isSimulatorResultPass(
  result: Pick<
    SimulatorResult,
    "outcome_match" | "source_match" | "terms_match"
  >,
): boolean {
  return (
    result.outcome_match &&
    result.source_match !== false &&
    result.terms_match
  );
}

export function summarizeSimulatorResults(
  results: Array<
    Pick<
      SimulatorResult,
      | "outcome_match"
      | "source_match"
      | "terms_match"
      | "actual_outcome"
      | "abstained"
      | "citation_count"
      | "latency_ms"
    >
  >,
): SimulatorMetrics {
  const total = results.length;
  const passed = results.filter(isSimulatorResultPass).length;
  const outcomeMatches = results.filter((result) => result.outcome_match).length;
  const answered = results.filter(
    (result) => result.actual_outcome === "answered",
  );
  const cited = answered.filter((result) => result.citation_count > 0).length;
  const sourceCases = results.filter((result) => result.source_match !== null);
  const sourceHits = sourceCases.filter((result) => result.source_match).length;
  const latencies = results
    .map((result) => result.latency_ms)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);

  return {
    total,
    passed,
    outcomeMatches,
    citationRate: answered.length ? cited / answered.length : 0,
    abstentionRate: total
      ? results.filter((result) => result.abstained).length / total
      : 0,
    outOfScope: results.filter(
      (result) => result.actual_outcome === "out_of_scope",
    ).length,
    blocked: results.filter(
      (result) => result.actual_outcome === "blocked",
    ).length,
    errors: results.filter((result) => result.actual_outcome === "error").length,
    averageLatencyMs: latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null,
    p95LatencyMs: latencies.length
      ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)]
      : null,
    sourceHitRate: sourceCases.length ? sourceHits / sourceCases.length : null,
    termsHitRate: total
      ? results.filter((result) => result.terms_match).length / total
      : 0,
  };
}
