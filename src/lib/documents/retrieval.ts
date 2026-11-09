import type { SupabaseClient } from "@supabase/supabase-js";

export async function getPublishedDocumentIdsForGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<{ ok: true; ids: string[] } | { ok: false }> {
  const [{ data: owned, error: ownedError }, { data: common, error: commonError }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id")
        .eq("group_id", groupId)
        .eq("status", "published"),
      supabase
        .from("documents")
        .select("id")
        .eq("visibility", "common")
        .eq("status", "published"),
    ]);

  if (ownedError || commonError) return { ok: false };

  return {
    ok: true,
    ids: [
      ...new Set([
        ...((owned ?? []) as { id: string }[]).map((document) => document.id),
        ...((common ?? []) as { id: string }[]).map((document) => document.id),
      ]),
    ],
  };
}
