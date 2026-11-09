"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_GROUP_COOKIE } from "@/lib/auth/group-context";
import { requireWorkspaceUser } from "@/lib/auth/workspace";

export async function setActiveGroupAction(formData: FormData) {
  const { supabase, profile } = await requireWorkspaceUser();

  if (!profile.is_superadmin) {
    redirect("/app");
  }

  const value = formData.get("group_id");
  const groupId = typeof value === "string" ? value.trim() : "";

  if (!groupId) {
    redirect("/app?group_error=missing");
  }

  const { data: group, error } = await supabase
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .maybeSingle<{ id: string }>();

  if (error || !group) {
    redirect("/app?group_error=invalid");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_GROUP_COOKIE, group.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/app");
  redirect("/app");
}
