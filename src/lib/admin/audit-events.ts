import {
  normalizeAuditDate,
  normalizeAuditGroupId,
  normalizeAuditPage,
} from "@/lib/admin/audit";
import { bogotaDayEndIso, bogotaDayStartIso } from "@/lib/datetime";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";

export const AUDIT_EVENT_PAGE_SIZE = 25;
export const AUDIT_EXPORT_LIMIT = 5000;

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

export type AuditLogFilters = {
  q: string;
  eventType: string;
  groupId: string;
  from: string;
  to: string;
};

export type AuditLogRow = {
  seq: number;
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_email: string | null;
  group_id: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  prev_hash: string | null;
  event_hash: string;
  created_at: string;
  actor_name: string | null;
};

export type AuditLogResult = {
  configured: boolean;
  events: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
};

export type AuditChainVerification = {
  configured: boolean;
  ok: boolean;
  checked: number;
  brokenEventId: string | null;
  brokenSeq: number | null;
  message: string;
  error: string | null;
};

export function normalizeAuditEventType(value: string): string {
  return EVENT_TYPE_PATTERN.test(value) ? value : "";
}

export function normalizeAuditLogFilters(
  input: AuditLogFilters,
  isSuperadmin: boolean,
  adminGroupIds: string[],
): AuditLogFilters {
  return {
    q: input.q.trim().slice(0, 200).replaceAll(",", " "),
    eventType: normalizeAuditEventType(input.eventType.trim()),
    groupId: normalizeAuditGroupId(input.groupId, isSuperadmin, adminGroupIds),
    from: normalizeAuditDate(input.from),
    to: normalizeAuditDate(input.to),
  };
}

type FetchOptions = {
  page: number;
  pageSize: number;
};

async function fetchAuditLog(
  isSuperadmin: boolean,
  adminGroupIds: string[],
  filters: AuditLogFilters,
  options: FetchOptions,
): Promise<AuditLogResult> {
  const normalized = normalizeAuditLogFilters(filters, isSuperadmin, adminGroupIds);
  const page = Math.max(1, Math.floor(options.page));
  const pageSize = Math.max(1, Math.floor(options.pageSize));
  const empty: AuditLogResult = {
    configured: isServiceRoleConfigured(),
    events: [],
    total: 0,
    page,
    pageSize,
    error: null,
  };

  if (!isServiceRoleConfigured()) return empty;
  if (!isSuperadmin && !adminGroupIds.length) return empty;

  const supabase = createServiceClient();
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("audit_events")
    .select(
      "seq, id, event_type, actor_id, actor_email, group_id, target_type, target_id, metadata, prev_hash, event_hash, created_at",
      { count: "exact" },
    )
    .order("seq", { ascending: false })
    .range(from, from + pageSize - 1);

  if (!isSuperadmin) {
    query = query.in("group_id", adminGroupIds);
  }
  if (normalized.eventType) {
    query = query.eq("event_type", normalized.eventType);
  }
  if (normalized.groupId) {
    query = query.eq("group_id", normalized.groupId);
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
    query = query.or(
      `actor_email.ilike.%${normalized.q}%,target_id.ilike.%${normalized.q}%`,
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return { ...empty, error: error.message };
  }

  const rows = (data ?? []) as Omit<AuditLogRow, "actor_name">[];
  const actorIds = [
    ...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id))),
  ];

  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null }[] };

  const namesById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null }[]).map((profile) => [
      profile.id,
      profile.full_name,
    ]),
  );

  return {
    configured: true,
    events: rows.map((row) => ({
      ...row,
      metadata: row.metadata ?? {},
      actor_name: row.actor_id ? (namesById.get(row.actor_id) ?? null) : null,
    })),
    total: count ?? 0,
    page,
    pageSize,
    error: null,
  };
}

export async function getAuditLog(
  isSuperadmin: boolean,
  adminGroupIds: string[],
  filters: AuditLogFilters,
  page = 1,
): Promise<AuditLogResult> {
  return fetchAuditLog(isSuperadmin, adminGroupIds, filters, {
    page: normalizeAuditPage(String(page)),
    pageSize: AUDIT_EVENT_PAGE_SIZE,
  });
}

export async function getAuditLogExport(
  isSuperadmin: boolean,
  adminGroupIds: string[],
  filters: AuditLogFilters,
): Promise<AuditLogResult> {
  return fetchAuditLog(isSuperadmin, adminGroupIds, filters, {
    page: 1,
    pageSize: AUDIT_EXPORT_LIMIT,
  });
}

export async function verifyAuditChain(): Promise<AuditChainVerification> {
  const base: AuditChainVerification = {
    configured: isServiceRoleConfigured(),
    ok: false,
    checked: 0,
    brokenEventId: null,
    brokenSeq: null,
    message: "Auditoría no configurada.",
    error: null,
  };

  if (!isServiceRoleConfigured()) return base;

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("verify_audit_chain", {
    p_limit: null,
  });

  if (error) {
    return { ...base, error: error.message, message: "No fue posible verificar la cadena." };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        is_valid: boolean;
        checked: number | string;
        broken_event_id: string | null;
        broken_seq: number | string | null;
        message: string;
      }
    | undefined;

  if (!row) {
    return {
      ...base,
      ok: true,
      message: "Cadena de auditoría vacía.",
    };
  }

  return {
    configured: true,
    ok: Boolean(row.is_valid),
    checked: Number(row.checked ?? 0),
    brokenEventId: row.broken_event_id,
    brokenSeq: row.broken_seq == null ? null : Number(row.broken_seq),
    message: row.message,
    error: null,
  };
}
