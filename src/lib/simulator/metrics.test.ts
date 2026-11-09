import { describe, expect, it } from "vitest";

import type { AgentQueryResponse } from "@/lib/agent/types";

import {
  evaluateAgentResponse,
  isSimulatorResultPass,
  matchesExpectedTerms,
  summarizeSimulatorResults,
} from "./metrics";
import type { SimulatorResult } from "./types";

function response(overrides: Partial<AgentQueryResponse> = {}): AgentQueryResponse {
  return {
    answer: "El plazo del artículo 631-5 es de dos meses.",
    abstained: false,
    outcome: "answered",
    outcomeReason: null,
    sources: [
      {
        rank: 1,
        chunk_id: "chunk-1",
        document_id: "doc-1",
        version_id: "version-1",
        version: 1,
        title: "Estatuto Tributario",
        page: 12,
        section: "Artículo 631-5",
        article: "631-5",
        numeral: null,
        similarity: 0.91,
        excerpt: "El plazo es de dos meses.",
      },
    ],
    model: "gemma-4",
    latencyMs: 850,
    auditSaved: false,
    ...overrides,
  };
}

function result(overrides: Partial<SimulatorResult> = {}): SimulatorResult {
  return {
    id: "result-1",
    run_id: "run-1",
    group_id: "group-1",
    case_id: "case-1",
    case_title: "Plazo 631-5",
    question: "¿Cuál es el plazo del artículo 631-5?",
    expected_outcome: "answered",
    actual_outcome: "answered",
    outcome_match: true,
    expected_document_id: "doc-1",
    source_match: true,
    expected_terms: ["631-5"],
    terms_match: true,
    answer: "Dos meses.",
    abstained: false,
    citation_count: 1,
    latency_ms: 800,
    error: null,
    sources: [],
    created_at: "2026-11-12T00:00:00Z",
    ...overrides,
  };
}

describe("matchesExpectedTerms", () => {
  it("ignores case and accepts empty term lists", () => {
    expect(matchesExpectedTerms("PLAZO de DOS meses", ["plazo", "dos"])).toBe(true);
    expect(matchesExpectedTerms("cualquier texto", [])).toBe(true);
  });

  it("requires every term to appear", () => {
    expect(matchesExpectedTerms("solo plazo", ["plazo", "dos"])).toBe(false);
  });
});

describe("evaluateAgentResponse", () => {
  it("compares outcome, source and terms", () => {
    expect(
      evaluateAgentResponse({
        expectedOutcome: "answered",
        expectedDocumentId: "doc-1",
        expectedTerms: ["631-5"],
        response: response(),
      }),
    ).toEqual({
      outcomeMatch: true,
      sourceMatch: true,
      termsMatch: true,
      citationCount: 1,
    });
  });

  it("reports a missing expected source and null when unspecified", () => {
    const missing = evaluateAgentResponse({
      expectedOutcome: "answered",
      expectedDocumentId: "doc-2",
      expectedTerms: [],
      response: response(),
    });
    expect(missing.sourceMatch).toBe(false);

    const unspecified = evaluateAgentResponse({
      expectedOutcome: "answered",
      expectedDocumentId: null,
      expectedTerms: [],
      response: response(),
    });
    expect(unspecified.sourceMatch).toBeNull();
  });
});

describe("isSimulatorResultPass", () => {
  it("treats unspecified sources as not failing", () => {
    expect(isSimulatorResultPass({ outcome_match: true, source_match: null, terms_match: true })).toBe(true);
    expect(isSimulatorResultPass({ outcome_match: true, source_match: false, terms_match: true })).toBe(false);
  });
});

describe("summarizeSimulatorResults", () => {
  it("computes pass, citation and latency metrics", () => {
    const metrics = summarizeSimulatorResults([
      result({ id: "a", latency_ms: 1000 }),
      result({
        id: "b",
        actual_outcome: "out_of_scope",
        outcome_match: false,
        source_match: null,
        terms_match: false,
        citation_count: 0,
        abstained: true,
        latency_ms: 500,
      }),
      result({
        id: "c",
        actual_outcome: "error",
        outcome_match: false,
        source_match: null,
        terms_match: false,
        citation_count: 0,
        abstained: true,
        latency_ms: null,
      }),
    ]);

    expect(metrics.total).toBe(3);
    expect(metrics.passed).toBe(1);
    expect(metrics.outcomeMatches).toBe(1);
    expect(metrics.citationRate).toBe(1);
    expect(metrics.abstentionRate).toBeCloseTo(2 / 3);
    expect(metrics.outOfScope).toBe(1);
    expect(metrics.errors).toBe(1);
    expect(metrics.averageLatencyMs).toBe(750);
    expect(metrics.p95LatencyMs).toBe(1000);
    expect(metrics.sourceHitRate).toBe(1);
    expect(metrics.termsHitRate).toBeCloseTo(1 / 3);
  });

  it("returns empty metrics for no results", () => {
    expect(summarizeSimulatorResults([])).toEqual({
      total: 0,
      passed: 0,
      outcomeMatches: 0,
      citationRate: 0,
      abstentionRate: 0,
      outOfScope: 0,
      blocked: 0,
      errors: 0,
      averageLatencyMs: null,
      p95LatencyMs: null,
      sourceHitRate: null,
      termsHitRate: 0,
    });
  });
});
