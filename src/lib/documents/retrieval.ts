import type { SupabaseClient } from "@supabase/supabase-js";

export type KnowledgeBaseDocumentCount =
  | { ok: true; count: number }
  | { ok: false };

export async function getKnowledgeBaseDocumentCount(
  supabase: SupabaseClient,
  groupIds: string[],
  options: { global?: boolean } = {},
): Promise<KnowledgeBaseDocumentCount> {
  if (!options.global && !groupIds.length) return { ok: true, count: 0 };

  let query = supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  if (!options.global) {
    query = query.in("group_id", groupIds);
  }

  const { count, error } = await query;
  if (error) return { ok: false };

  return { ok: true, count: count ?? 0 };
}

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
