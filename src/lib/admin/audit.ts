import { bogotaDayEndIso, bogotaDayStartIso } from "@/lib/datetime";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";

export const AUDIT_PAGE_SIZE = 25;

export const AUDIT_OUTCOMES = [
  "answered",
  "rejected",
  "blocked",
  "insufficient_evidence",
  "out_of_scope",
  "error",
] as const;

export type AuditFilterInput = {
  q: string;
  outcome: string;
  groupId: string;
  user: string;
  from: string;
  to: string;
};

export type AuditEvent = {
  id: string;
  user_id: string;
  group_ids: string[];
  question: string;
  answer: string | null;
  outcome: string;
  outcome_reason: string | null;
  abstained: boolean;
  model: string | null;
  prompt_version: string | null;
  latency_ms: number | null;
  source_count: number;
  grounding_score: number | null;
  controls: Record<string, unknown> | null;
  created_at: string;
  user_email: string;
  user_name: string | null;
};

export type AuditSource = {
  query_id: string;
  rank: number;
  similarity: number | null;
  document_title: string | null;
  document_version: number | null;
};

export type AuditResult = {
  configured: boolean;
  events: AuditEvent[];
  sourcesByQuery: Record<string, AuditSource[]>;
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeAuditOutcome(value: string): string {
  return (AUDIT_OUTCOMES as readonly string[]).includes(value) ? value : "";
}

export function normalizeAuditGroupId(
  value: string,
  isSuperadmin: boolean,
  adminGroupIds: string[],
): string {
  if (!value) return "";
  if (isSuperadmin) return value;
  return adminGroupIds.includes(value) ? value : "";
}

export function normalizeAuditUser(value: string): string {
  return value.trim().slice(0, 200);
}

export function normalizeAuditDate(value: string): string {
  return DATE_PATTERN.test(value) ? value : "";
}

export function normalizeAuditPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

export function normalizeAuditFilters(
  input: AuditFilterInput,
  isSuperadmin: boolean,
  adminGroupIds: string[],
): AuditFilterInput {
  return {
    q: input.q.trim().slice(0, 200),
    outcome: normalizeAuditOutcome(input.outcome),
    groupId: normalizeAuditGroupId(input.groupId, isSuperadmin, adminGroupIds),
    user: normalizeAuditUser(input.user),
    from: normalizeAuditDate(input.from),
    to: normalizeAuditDate(input.to),
  };
}

export async function getAuditEvents(
  isSuperadmin: boolean,
  adminGroupIds: string[],
  filters: AuditFilterInput,
  page = 1,
): Promise<AuditResult> {
  const normalized = normalizeAuditFilters(filters, isSuperadmin, adminGroupIds);
  const safePage = Math.max(1, Math.floor(page));
  const empty: AuditResult = {
    configured: isServiceRoleConfigured(),
    events: [],
    sourcesByQuery: {},
    total: 0,
    page: safePage,
    pageSize: AUDIT_PAGE_SIZE,
    error: null,
  };

  if (!isServiceRoleConfigured()) return empty;
  if (!isSuperadmin && !adminGroupIds.length) return empty;

  const supabase = createServiceClient();
  const from = (safePage - 1) * AUDIT_PAGE_SIZE;

  let userFilterIds: string[] | null = null;
  if (normalized.user) {
    if (UUID_PATTERN.test(normalized.user)) {
      userFilterIds = [normalized.user];
    } else {
      const { data: matches } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", `%${normalized.user}%`)
        .limit(50);
      userFilterIds = ((matches ?? []) as { id: string }[]).map((match) => match.id);
      if (!userFilterIds.length) return empty;
    }
  }

  let query = supabase
    .from("agent_queries")
    .select(
      "id, user_id, group_ids, question, answer, outcome, outcome_reason, abstained, model, prompt_version, latency_ms, source_count, grounding_score, controls, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);

  if (!isSuperadmin) {
    query = query.overlaps("group_ids", adminGroupIds);
  }
  if (normalized.groupId) {
    query = query.contains("group_ids", [normalized.groupId]);
  }
  if (normalized.outcome) {
    query = query.eq("outcome", normalized.outcome);
  }
  if (userFilterIds) {
    query = query.in("user_id", userFilterIds);
  }
  const fromIso = normalized.from ? bogotaDayStartIso(normalized.from) : null;
  if (fromIso) {
    query = query.gte("created_at", fromIso);
  }
  const toIso = normalized.to ? bogotaDayEndIso(normalized.to) : null;
  if (toIso) {
    query = query.lte("created_at", toIso);
  }
  if (normalized.q) {
    query = query.ilike("question", `%${normalized.q}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return {
      ...empty,
      error: error.message,
    };
  }

  const rows = (data ?? []) as Omit<AuditEvent, "user_email" | "user_name">[];
  const queryIds = rows.map((row) => row.id);
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const [{ data: profiles }, { data: sourceData }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, email, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; full_name: string | null }[] }),
    queryIds.length
      ? supabase
          .from("agent_query_sources")
          .select("query_id, rank, similarity, document_title, document_version")
          .in("query_id", queryIds)
          .order("rank", { ascending: true })
      : Promise.resolve({ data: [] as AuditSource[] }),
  ]);

  const profilesById = new Map(
    ((profiles ?? []) as { id: string; email: string | null; full_name: string | null }[]).map(
      (profile) => [profile.id, profile],
    ),
  );

  const sourcesByQuery: Record<string, AuditSource[]> = {};
  for (const source of (sourceData ?? []) as AuditSource[]) {
    const list = sourcesByQuery[source.query_id] ?? [];
    list.push(source);
    sourcesByQuery[source.query_id] = list;
  }

  return {
    configured: true,
    events: rows.map((row) => ({
      ...row,
      controls: row.controls ?? {},
      user_email: profilesById.get(row.user_id)?.email ?? "Sin correo",
      user_name: profilesById.get(row.user_id)?.full_name ?? null,
    })),
    sourcesByQuery,
    total: count ?? 0,
    page: safePage,
    pageSize: AUDIT_PAGE_SIZE,
    error: null,
  };
}

export const AUDIT_EXPORT_LIMIT = 5000;

export async function getAuditEventsExport(
  isSuperadmin: boolean,
  adminGroupIds: string[],
  filters: AuditFilterInput,
): Promise<AuditResult> {
  const normalized = normalizeAuditFilters(filters, isSuperadmin, adminGroupIds);
  const empty: AuditResult = {
    configured: isServiceRoleConfigured(),
    events: [],
    sourcesByQuery: {},
    total: 0,
    page: 1,
    pageSize: AUDIT_EXPORT_LIMIT,
    error: null,
  };

  if (!isServiceRoleConfigured()) return empty;
  if (!isSuperadmin && !adminGroupIds.length) return empty;

  const supabase = createServiceClient();

  let userFilterIds: string[] | null = null;
  if (normalized.user) {
    if (UUID_PATTERN.test(normalized.user)) {
      userFilterIds = [normalized.user];
    } else {
      const { data: matches } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", `%${normalized.user}%`)
        .limit(50);
      userFilterIds = ((matches ?? []) as { id: string }[]).map((match) => match.id);
      if (!userFilterIds.length) return empty;
    }
  }

  let query = supabase
    .from("agent_queries")
    .select(
      "id, user_id, group_ids, question, answer, outcome, outcome_reason, abstained, model, prompt_version, latency_ms, source_count, grounding_score, controls, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(AUDIT_EXPORT_LIMIT);

  if (!isSuperadmin) {
    query = query.overlaps("group_ids", adminGroupIds);
  }
  if (normalized.groupId) {
    query = query.contains("group_ids", [normalized.groupId]);
  }
  if (normalized.outcome) {
    query = query.eq("outcome", normalized.outcome);
  }
  if (userFilterIds) {
    query = query.in("user_id", userFilterIds);
  }
  const fromIso = normalized.from ? bogotaDayStartIso(normalized.from) : null;
  if (fromIso) {
    query = query.gte("created_at", fromIso);
  }
  const toIso = normalized.to ? bogotaDayEndIso(normalized.to) : null;
  if (toIso) {
    query = query.lte("created_at", toIso);
  }
  if (normalized.q) {
    query = query.ilike("question", `%${normalized.q}%`);
  }

  const { data, error } = await query;
  if (error) return { ...empty, error: error.message };

  const rows = (data ?? []) as Omit<AuditEvent, "user_email" | "user_name">[];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", userIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] };

  const profilesById = new Map(
    ((profiles ?? []) as { id: string; email: string | null; full_name: string | null }[]).map(
      (profile) => [profile.id, profile],
    ),
  );

  return {
    configured: true,
    events: rows.map((row) => ({
      ...row,
      controls: row.controls ?? {},
      user_email: profilesById.get(row.user_id)?.email ?? "Sin correo",
      user_name: profilesById.get(row.user_id)?.full_name ?? null,
    })),
    sourcesByQuery: {},
    total: rows.length,
    page: 1,
    pageSize: AUDIT_EXPORT_LIMIT,
    error: null,
  };
}

export async function getAuditQueryCount(
  isSuperadmin: boolean,
  adminGroupIds: string[],
): Promise<number | null> {
  if (!isServiceRoleConfigured()) return null;
  if (!isSuperadmin && !adminGroupIds.length) return 0;

  const supabase = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("agent_queries")
    .select("id", { head: true, count: "exact" })
    .gte("created_at", since);

  if (!isSuperadmin) {
    query = query.overlaps("group_ids", adminGroupIds);
  }

  const { count, error } = await query;
  if (error) {
    console.error("[admin] audit query count failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return count ?? 0;
}
