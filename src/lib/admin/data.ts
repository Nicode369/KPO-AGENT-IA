import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppRole, MembershipStatus } from "@/lib/auth/workspace";

export type AdminGroup = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
};

export type AdminInvitation = {
  invitation_id: string;
  group_id: string;
  group_name: string;
  role: AppRole;
  code: string | null;
  max_uses: number;
  use_count: number;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

export type AdminMember = {
  id: string;
  group_id: string;
  group_name: string;
  user_id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  role: AppRole;
  status: MembershipStatus;
  created_at: string;
};

const roleLabels: Record<AppRole, string> = {
  group_admin: "Administrador de grupo",
  supervisor: "Supervisor",
  analyst: "Analista",
};

export function roleLabel(role: AppRole) {
  return roleLabels[role];
}

export function getDefaultInvitationExpiry() {
  const next = new Date();
  next.setDate(next.getDate() + 365);
  return next.toISOString().slice(0, 10);
}

export async function getAdminGroups(
  supabase: SupabaseClient,
  isSuperadmin: boolean,
  adminGroupIds: string[],
): Promise<AdminGroup[]> {
  if (!isSuperadmin && !adminGroupIds.length) return [];

  let query = supabase
    .from("groups")
    .select("id, name, slug, is_active, created_at")
    .order("created_at", { ascending: true });

  if (!isSuperadmin) query = query.in("id", adminGroupIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminGroup[];
}

export async function getAdminInvitations(
  supabase: SupabaseClient,
  groups: AdminGroup[],
): Promise<AdminInvitation[]> {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const results = await Promise.all(
    groups.map(async (group) => {
      const { data, error } = await supabase.rpc("list_group_invitations", {
        p_group_id: group.id,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Omit<AdminInvitation, "group_id" | "group_name">[]).map((invitation) => ({
        ...invitation,
        code: invitation.code ?? null,
        group_id: group.id,
        group_name: groupNames.get(group.id) ?? "Grupo",
      }));
    }),
  );

  return results.flat().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getAdminMembers(
  supabase: SupabaseClient,
  groups: AdminGroup[],
): Promise<AdminMember[]> {
  const groupIds = groups.map((group) => group.id);
  if (!groupIds.length) return [];

  const { data: memberships, error } = await supabase
    .from("group_memberships")
    .select("id, group_id, user_id, role, status, created_at")
    .in("group_id", groupIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const userIds = [...new Set((memberships ?? []).map((membership) => membership.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, full_name, is_active")
        .in("id", userIds)
    : { data: [], error: null };

  if (profilesError) throw new Error(profilesError.message);

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  return (memberships ?? []).map((membership) => {
    const profile = profilesById.get(membership.user_id);
    return {
      id: membership.id,
      group_id: membership.group_id,
      group_name: groupNames.get(membership.group_id) ?? "Grupo",
      user_id: membership.user_id,
      email: profile?.email ?? "Sin correo",
      full_name: profile?.full_name ?? null,
      is_active: profile?.is_active ?? false,
      role: membership.role as AppRole,
      status: membership.status as MembershipStatus,
      created_at: membership.created_at,
    };
  });
}
