import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";

export type SecurityEvent = {
  id: string;
  user_id: string;
  group_ids: string[];
  question: string;
  outcome: "blocked" | "rejected";
  outcome_reason: string | null;
  controls: Record<string, unknown> | null;
  source_count: number;
  latency_ms: number | null;
  created_at: string;
  user_email: string;
  user_name: string | null;
};

export type SecurityEventsResult = {
  configured: boolean;
  events: SecurityEvent[];
  last24h: number;
  error: string | null;
};

const SECURITY_REASONS = [
  "system_prompt_request",
  "secret_request",
  "cross_group_request",
  "bulk_extraction",
  "role_play_override",
  "destructive_action",
  "evidence_tampering",
  "citation_bypass",
  "data_exfiltration",
  "output_guard_system_prompt_leak",
  "output_guard_secret_leak",
  "output_guard_destructive_confirmation",
] as const;

export async function getSecurityEvents(
  isSuperadmin: boolean,
  adminGroupIds: string[],
): Promise<SecurityEventsResult> {
  if (!isServiceRoleConfigured()) {
    return {
      configured: false,
      events: [],
      last24h: 0,
      error: null,
    };
  }

  if (!isSuperadmin && !adminGroupIds.length) {
    return {
      configured: true,
      events: [],
      last24h: 0,
      error: null,
    };
  }

  const supabase = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let eventsQuery = supabase
    .from("agent_queries")
    .select(
      "id, user_id, group_ids, question, outcome, outcome_reason, controls, source_count, latency_ms, created_at",
    )
    .in("outcome_reason", [...SECURITY_REASONS])
    .order("created_at", { ascending: false })
    .limit(100);

  let countQuery = supabase
    .from("agent_queries")
    .select("id", { head: true, count: "exact" })
    .in("outcome_reason", [...SECURITY_REASONS])
    .gte("created_at", since);

  if (!isSuperadmin) {
    eventsQuery = eventsQuery.overlaps("group_ids", adminGroupIds);
    countQuery = countQuery.overlaps("group_ids", adminGroupIds);
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    eventsQuery,
    countQuery,
  ]);

  if (error || countError) {
    return {
      configured: true,
      events: [],
      last24h: 0,
      error: error?.message ?? countError?.message ?? "No fue posible cargar los eventos.",
    };
  }

  const rows = (data ?? []) as Omit<SecurityEvent, "user_email" | "user_name">[];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds)
    : { data: [] };
  const profilesById = new Map(
    ((profiles ?? []) as { id: string; email: string | null; full_name: string | null }[]).map(
      (profile) => [profile.id, profile],
    ),
  );

  return {
    configured: true,
    events: rows.map((row) => ({
      ...row,
      user_email: profilesById.get(row.user_id)?.email ?? "Sin correo",
      user_name: profilesById.get(row.user_id)?.full_name ?? null,
    })),
    last24h: count ?? 0,
    error: null,
  };
}

export async function getSecurityAlertCount(
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
    .in("outcome_reason", [...SECURITY_REASONS])
    .gte("created_at", since);

  if (!isSuperadmin) {
    query = query.overlaps("group_ids", adminGroupIds);
  }

  const { count, error } = await query;
  if (error) {
    console.error("[admin] security alert count failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return count ?? 0;
}
