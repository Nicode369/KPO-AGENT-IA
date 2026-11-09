import { getSecurityAlertCount } from "@/lib/admin/security";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";

const OUTCOMES = [
  "answered",
  "rejected",
  "blocked",
  "insufficient_evidence",
  "out_of_scope",
  "error",
] as const;

const DOCUMENT_STATUSES = [
  "uploaded",
  "processing",
  "pending_review",
  "approved",
  "published",
  "rejected",
  "retired",
  "error",
] as const;

export type AuditOverview = {
  configured: boolean;
  error: string | null;
  queries24h: number;
  queriesByOutcome: Record<string, number>;
  security24h: number | null;
  audit24h: number;
  auditTotal: number;
  documentsTotal: number;
  documentsByStatus: Record<string, number>;
  lastEvent: {
    seq: number;
    event_type: string;
    event_hash: string;
    created_at: string;
  } | null;
};

function emptyOverview(configured: boolean): AuditOverview {
  return {
    configured,
    error: null,
    queries24h: 0,
    queriesByOutcome: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])),
    security24h: configured ? 0 : null,
    audit24h: 0,
    auditTotal: 0,
    documentsTotal: 0,
    documentsByStatus: Object.fromEntries(
      DOCUMENT_STATUSES.map((status) => [status, 0]),
    ),
    lastEvent: null,
  };
}

export async function getAuditOverview(
  isSuperadmin: boolean,
  adminGroupIds: string[],
): Promise<AuditOverview> {
  if (!isServiceRoleConfigured()) return emptyOverview(false);
  if (!isSuperadmin && !adminGroupIds.length) return emptyOverview(true);

  const supabase = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let queriesQuery = supabase
    .from("agent_queries")
    .select("outcome")
    .gte("created_at", since)
    .limit(10000);
  let audit24Query = supabase
    .from("audit_events")
    .select("id", { head: true, count: "exact" })
    .gte("created_at", since);
  let auditTotalQuery = supabase
    .from("audit_events")
    .select("id", { head: true, count: "exact" });
  let lastEventQuery = supabase
    .from("audit_events")
    .select("seq, event_type, event_hash, created_at")
    .order("seq", { ascending: false })
    .limit(1);
  let documentsQuery = supabase.from("documents").select("status").limit(5000);

  if (!isSuperadmin) {
    queriesQuery = queriesQuery.overlaps("group_ids", adminGroupIds);
    audit24Query = audit24Query.in("group_id", adminGroupIds);
    auditTotalQuery = auditTotalQuery.in("group_id", adminGroupIds);
    lastEventQuery = lastEventQuery.in("group_id", adminGroupIds);
    documentsQuery = documentsQuery.in("group_id", adminGroupIds);
  }

  const [
    queriesResult,
    security24h,
    audit24Result,
    auditTotalResult,
    lastEventResult,
    documentsResult,
  ] = await Promise.all([
    queriesQuery,
    getSecurityAlertCount(isSuperadmin, adminGroupIds),
    audit24Query,
    auditTotalQuery,
    lastEventQuery,
    documentsQuery,
  ]);

  const errorMessage =
    queriesResult.error?.message ??
    audit24Result.error?.message ??
    auditTotalResult.error?.message ??
    lastEventResult.error?.message ??
    documentsResult.error?.message ??
    null;

  const queriesByOutcome = Object.fromEntries(
    OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<string, number>;

  const queryRows = (queriesResult.data ?? []) as { outcome: string }[];
  for (const row of queryRows) {
    if (row.outcome in queriesByOutcome) {
      queriesByOutcome[row.outcome] += 1;
    }
  }

  const documentsByStatus = Object.fromEntries(
    DOCUMENT_STATUSES.map((status) => [status, 0]),
  ) as Record<string, number>;

  let documentsTotal = 0;
  for (const row of (documentsResult.data ?? []) as { status: string }[]) {
    documentsTotal += 1;
    if (row.status in documentsByStatus) {
      documentsByStatus[row.status] += 1;
    }
  }

  const lastEvent = ((lastEventResult.data ?? [])[0] ?? null) as AuditOverview["lastEvent"];

  return {
    configured: true,
    error: errorMessage,
    queries24h: queryRows.length,
    queriesByOutcome,
    security24h,
    audit24h: audit24Result.count ?? 0,
    auditTotal: auditTotalResult.count ?? 0,
    documentsTotal,
    documentsByStatus,
    lastEvent: lastEvent
      ? {
          ...lastEvent,
          seq: Number(lastEvent.seq),
        }
      : null,
  };
}
