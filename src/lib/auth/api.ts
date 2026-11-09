import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppRole, MembershipStatus } from "@/lib/auth/workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type ApiProfile = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superadmin: boolean;
  sessions_revoked_at: string | null;
};

export type ApiMembership = {
  group_id: string;
  role: AppRole;
  status: MembershipStatus;
};

export type ApiWorkspace = {
  supabase: SupabaseClient;
  userId: string;
  profile: ApiProfile;
  memberships: ApiMembership[];
  groupIds: string[];
  token: string;
  isSuperadmin: boolean;
};

export type ApiWorkspaceResult =
  | { ok: true; value: ApiWorkspace }
  | { ok: false; status: number; code: string; message: string };

export async function getApiWorkspace(): Promise<ApiWorkspaceResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "not_configured",
      message: "La aplicación no está configurada.",
    };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "Inicia sesión.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, is_active, is_superadmin, sessions_revoked_at",
    )
    .eq("id", userId)
    .maybeSingle<ApiProfile>();

  if (!profile?.is_active) {
    return {
      ok: false,
      status: 403,
      code: "inactive_account",
      message: "La cuenta no está activa.",
    };
  }

  const issuedAt = Number(claimsData?.claims?.iat ?? 0);
  const revokedAt = profile.sessions_revoked_at
    ? Math.floor(new Date(profile.sessions_revoked_at).getTime() / 1000)
    : 0;
  if (revokedAt > 0 && issuedAt < revokedAt) {
    return {
      ok: false,
      status: 401,
      code: "session_revoked",
      message: "La sesión fue revocada.",
    };
  }

  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!profile.is_superadmin && !memberships?.length) {
    return {
      ok: false,
      status: 403,
      code: "no_active_group",
      message: "No tienes grupos activos.",
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "Inicia sesión.",
    };
  }

  const normalizedMemberships = (memberships ?? []) as ApiMembership[];
  return {
    ok: true,
    value: {
      supabase,
      userId,
      profile,
      memberships: normalizedMemberships,
      groupIds: normalizedMemberships.map((membership) => membership.group_id),
      token,
      isSuperadmin: profile.is_superadmin,
    },
  };
}
