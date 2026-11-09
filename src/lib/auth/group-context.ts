import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import {
  selectActiveGroup,
  type GroupOption,
} from "@/lib/auth/group-selection";

export const ACTIVE_GROUP_COOKIE = "kpo_active_group";

export type SuperadminGroupContext = {
  groups: GroupOption[];
  activeGroup: GroupOption | null;
};

export async function getSuperadminGroupContext(
  supabase: SupabaseClient,
  isSuperadmin: boolean,
): Promise<SuperadminGroupContext> {
  if (!isSuperadmin) {
    return { groups: [], activeGroup: null };
  }

  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("[auth] group context failed", {
      code: error.code,
      message: error.message,
    });
    return { groups: [], activeGroup: null };
  }

  const groups = (data ?? []) as GroupOption[];
  const cookieStore = await cookies();
  const requestedGroupId = cookieStore.get(ACTIVE_GROUP_COOKIE)?.value;

  return {
    groups,
    activeGroup: selectActiveGroup(groups, requestedGroupId),
  };
}
