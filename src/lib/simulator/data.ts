import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SimulatorCase,
  SimulatorExpectedOutcome,
  SimulatorResult,
  SimulatorRun,
  SimulatorRunStatus,
} from "./types";

type CaseRow = {
  id: string;
  group_id: string;
  title: string;
  question: string;
  expected_outcome: string;
  expected_document_id: string | null;
  expected_terms: string[] | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  group_id: string;
  created_by: string;
  status: string;
  total_cases: number;
  completed_cases: number;
  started_at: string;
  finished_at: string | null;
  metadata: Record<string, unknown> | null;
};

type ResultRow = {
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
  expected_terms: string[] | null;
  terms_match: boolean;
  answer: string | null;
  abstained: boolean;
  citation_count: number;
  latency_ms: number | null;
  error: string | null;
  sources: SimulatorResult["sources"] | null;
  created_at: string;
};

export async function getSimulatorCases(
  supabase: SupabaseClient,
  groupId: string,
  groupName: string,
): Promise<SimulatorCase[]> {
  const { data, error } = await supabase
    .from("simulator_cases")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as CaseRow[];
  const documentIds = [
    ...new Set(
      rows
        .map((row) => row.expected_document_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const { data: documents, error: documentsError } = documentIds.length
    ? await supabase
        .from("documents")
        .select("id, title")
        .in("id", documentIds)
    : { data: [], error: null };

  if (documentsError) throw new Error(documentsError.message);
  const documentTitles = new Map(
    ((documents ?? []) as { id: string; title: string }[]).map((document) => [
      document.id,
      document.title,
    ]),
  );

  return rows.map((row) => ({
    ...row,
    group_name: groupName,
    expected_outcome: row.expected_outcome as SimulatorExpectedOutcome,
    expected_terms: row.expected_terms ?? [],
    expected_document_title: row.expected_document_id
      ? documentTitles.get(row.expected_document_id) ?? null
      : null,
  }));
}

export async function getSimulatorDocuments(
  supabase: SupabaseClient,
  groupId: string,
): Promise<{ id: string; title: string }[]> {
  const [{ data: owned, error: ownedError }, { data: common, error: commonError }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id, title")
        .eq("group_id", groupId)
        .eq("status", "published")
        .order("title", { ascending: true }),
      supabase
        .from("documents")
        .select("id, title")
        .eq("visibility", "common")
        .eq("status", "published")
        .order("title", { ascending: true }),
    ]);

  if (ownedError) throw new Error(ownedError.message);
  if (commonError) throw new Error(commonError.message);

  const documents = new Map<string, { id: string; title: string }>();
  for (const document of [
    ...((owned ?? []) as { id: string; title: string }[]),
    ...((common ?? []) as { id: string; title: string }[]),
  ]) {
    documents.set(document.id, document);
  }

  return [...documents.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "es"),
  );
}

export async function getSimulatorRuns(
  supabase: SupabaseClient,
  groupId: string,
  groupName: string,
  limit = 10,
): Promise<SimulatorRun[]> {
  const { data, error } = await supabase
    .from("simulator_runs")
    .select("*")
    .eq("group_id", groupId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as RunRow[]).map((row) => ({
    ...row,
    group_name: groupName,
    status: row.status as SimulatorRunStatus,
    metadata: row.metadata ?? {},
  }));
}

export async function getSimulatorResults(
  supabase: SupabaseClient,
  runId: string,
): Promise<SimulatorResult[]> {
  const { data, error } = await supabase
    .from("simulator_results")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as ResultRow[]).map((row) => ({
    ...row,
    expected_terms: row.expected_terms ?? [],
    sources: row.sources ?? [],
  }));
}
