import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";

export type AuditEventInput = {
  eventType: string;
  actorId?: string | null;
  actorEmail?: string | null;
  groupId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Appends an event to the hash-chained audit log. Never throws: audit failures
 * must not break authentication or administrative flows. Requires the service
 * role key because the audit table is not readable or writable by clients.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<boolean> {
  if (!isServiceRoleConfigured()) return false;

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("append_audit_event", {
      p_event_type: input.eventType,
      p_actor_id: input.actorId ?? null,
      p_actor_email: input.actorEmail ?? null,
      p_group_id: input.groupId ?? null,
      p_target_type: input.targetType ?? null,
      p_target_id: input.targetId ?? null,
      p_metadata: input.metadata ?? {},
    });

    if (error) {
      console.error("[audit] append failed", {
        code: error.code,
        message: error.message,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error("[audit] append threw", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}
