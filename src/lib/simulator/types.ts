export const SIMULATOR_EXPECTED_OUTCOMES = [
  "answered",
  "insufficient_evidence",
  "out_of_scope",
  "blocked",
  "rejected",
  "error",
] as const;

export type SimulatorExpectedOutcome =
  (typeof SIMULATOR_EXPECTED_OUTCOMES)[number];

export type SimulatorCase = {
  id: string;
  group_id: string;
  group_name: string;
  title: string;
  question: string;
  expected_outcome: SimulatorExpectedOutcome;
  expected_document_id: string | null;
  expected_document_title: string | null;
  expected_terms: string[];
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SimulatorRunStatus = "running" | "completed" | "failed";

export type SimulatorRun = {
  id: string;
  group_id: string;
  group_name: string;
  created_by: string;
  status: SimulatorRunStatus;
  total_cases: number;
  completed_cases: number;
  started_at: string;
  finished_at: string | null;
  metadata: Record<string, unknown>;
};

export type SimulatorResult = {
  id: string;
  run_id: string;
  group_id: string;
  case_id: string | null;
  case_title: string;
  question: string;
  expected_outcome: string;
  actual_outcome: string;
  outcome_match: boolean;
  expected_document_id: string | null;
  source_match: boolean | null;
  expected_terms: string[];
  terms_match: boolean;
  answer: string | null;
  abstained: boolean;
  citation_count: number;
  latency_ms: number | null;
  error: string | null;
  sources: { document_id: string; title: string; rank: number }[];
  created_at: string;
};

export type SimulatorMetrics = {
  total: number;
  passed: number;
  outcomeMatches: number;
  citationRate: number;
  abstentionRate: number;
  outOfScope: number;
  blocked: number;
  errors: number;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  sourceHitRate: number | null;
  termsHitRate: number;
};

export type SimulatorCaseInput = {
  groupId: string;
  title: string;
  question: string;
  expectedOutcome: SimulatorExpectedOutcome;
  expectedDocumentId: string | null;
  expectedTerms: string[];
  notes: string | null;
};
