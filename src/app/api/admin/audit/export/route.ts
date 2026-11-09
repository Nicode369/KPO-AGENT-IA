import { NextResponse, type NextRequest } from "next/server";

import { recordAuditEvent } from "@/lib/audit/log";
import { buildCsv, type CsvColumn } from "@/lib/admin/csv";
import {
  getAuditEventsExport,
  normalizeAuditFilters,
  type AuditFilterInput,
} from "@/lib/admin/audit";
import {
  getAuditLogExport,
  normalizeAuditLogFilters,
  type AuditLogFilters,
} from "@/lib/admin/audit-events";
import { requireAdminUser } from "@/lib/auth/workspace";
import { APP_TIME_ZONE, formatDateTime } from "@/lib/datetime";

const QUERY_COLUMNS: CsvColumn[] = [
  { key: "created_at", label: "Fecha (Colombia)" },
  { key: "user_email", label: "Usuario" },
  { key: "user_name", label: "Nombre" },
  { key: "question", label: "Pregunta" },
  { key: "answer", label: "Respuesta" },
  { key: "outcome", label: "Resultado" },
  { key: "outcome_reason", label: "Motivo" },
  { key: "model", label: "Modelo" },
  { key: "prompt_version", label: "Prompt" },
  { key: "latency_ms", label: "Latencia (ms)" },
  { key: "source_count", label: "Fuentes" },
  { key: "grounding_score", label: "Grounding" },
];

const EVENT_COLUMNS: CsvColumn[] = [
  { key: "created_at", label: "Fecha (Colombia)" },
  { key: "seq", label: "Secuencia" },
  { key: "event_type", label: "Evento" },
  { key: "actor_email", label: "Actor" },
  { key: "actor_name", label: "Nombre del actor" },
  { key: "group_id", label: "Grupo" },
  { key: "target_type", label: "Tipo de objetivo" },
  { key: "target_id", label: "Objetivo" },
  { key: "metadata", label: "Metadatos" },
  { key: "event_hash", label: "Hash" },
  { key: "prev_hash", label: "Hash anterior" },
];

function csvParam(params: URLSearchParams, name: string): string {
  return params.get(name) ?? "";
}

function fileName(dataset: string): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
  }).format(new Date());
  return `auditoria-${dataset}-${date}.csv`;
}

export async function GET(request: NextRequest) {
  const { userId, profile, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const params = request.nextUrl.searchParams;
  const dataset = params.get("dataset") === "queries" ? "queries" : "events";
  const group = csvParam(params, "group");
  const from = csvParam(params, "from");
  const to = csvParam(params, "to");

  let csv: string;
  let rowCount: number;
  let metadata: Record<string, unknown>;

  if (dataset === "queries") {
    const input: AuditFilterInput = {
      q: csvParam(params, "q"),
      outcome: csvParam(params, "outcome"),
      groupId: group,
      user: csvParam(params, "user"),
      from,
      to,
    };
    const filters = normalizeAuditFilters(input, isSuperadmin, adminGroupIds);
    const result = await getAuditEventsExport(isSuperadmin, adminGroupIds, filters);

    if (!result.configured) {
      return NextResponse.json(
        { error: "La auditoría requiere SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 },
      );
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    rowCount = result.events.length;
    metadata = { dataset, rowCount, filters };
    csv = buildCsv(
      QUERY_COLUMNS,
      result.events.map((event) => ({
        ...event,
        created_at: formatDateTime(event.created_at),
      })),
    );
  } else {
    const input: AuditLogFilters = {
      q: csvParam(params, "q"),
      eventType: csvParam(params, "type"),
      groupId: group,
      from,
      to,
    };
    const filters = normalizeAuditLogFilters(input, isSuperadmin, adminGroupIds);
    const result = await getAuditLogExport(isSuperadmin, adminGroupIds, filters);

    if (!result.configured) {
      return NextResponse.json(
        { error: "La auditoría requiere SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 },
      );
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    rowCount = result.events.length;
    metadata = { dataset, rowCount, filters };
    csv = buildCsv(
      EVENT_COLUMNS,
      result.events.map((event) => ({
        ...event,
        created_at: formatDateTime(event.created_at),
        metadata: JSON.stringify(event.metadata),
      })),
    );
  }

  await recordAuditEvent({
    eventType: "audit_export",
    actorId: userId,
    actorEmail: profile.email,
    groupId: group || null,
    targetType: "export",
    targetId: dataset,
    metadata,
  });

  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName(dataset)}"`,
      "cache-control": "no-store",
    },
  });
}
