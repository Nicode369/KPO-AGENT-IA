import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "group_admin" | "supervisor" | "analyst";
export type MembershipStatus = "pending" | "active" | "disabled";

export type WorkspaceProfile = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superadmin: boolean;
  sessions_revoked_at?: string | null;
};

export type WorkspaceMembership = {
  id: string;
  group_id: string;
  role: AppRole;
  status: MembershipStatus;
};

export async function requireWorkspaceUser() {
  if (!isSupabaseConfigured()) redirect("/login?error=not_configured");

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<WorkspaceProfile>();

  if (!profile?.is_active) redirect("/login?error=inactive");

  const issuedAt = Number(claimsData?.claims?.iat ?? 0);
  const revokedAt = profile.sessions_revoked_at
    ? Math.floor(new Date(profile.sessions_revoked_at).getTime() / 1000)
    : 0;

  if (revokedAt > 0 && issuedAt < revokedAt) {
    await supabase.auth.signOut();
    redirect("/login?error=session_revoked");
  }

  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("id, group_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!profile.is_superadmin && !memberships?.length) {
    redirect("/login?error=inactive");
  }

  return {
    supabase,
    userId,
    profile,
    memberships: (memberships ?? []) as WorkspaceMembership[],
  };
}

export async function requireAdminUser() {
  const context = await requireWorkspaceUser();
  const adminMemberships = context.memberships.filter(
    (membership) => membership.role === "group_admin",
  );

  if (!context.profile.is_superadmin && !adminMemberships.length) {
    redirect("/app");
  }

  return {
    ...context,
    isSuperadmin: context.profile.is_superadmin,
    adminMemberships,
    adminGroupIds: adminMemberships.map((membership) => membership.group_id),
  };
}
