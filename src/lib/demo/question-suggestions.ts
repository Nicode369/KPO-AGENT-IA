import type { SupabaseClient } from "@supabase/supabase-js";

import seed from "../../../data/question-suggestions.json";

export type QuestionGroup = {
  id: string;
  label: string;
  slug: string;
  questions: string[];
};

type GroupInput = {
  id: string;
  name: string;
  slug?: string | null;
};

const SEED: Record<string, string[]> = seed;

export function questionsForSlug(slug: string | null | undefined): string[] {
  if (!slug) return [];
  return SEED[slug] ?? [];
}

export async function loadQuestionSuggestions(
  supabase: SupabaseClient,
  groups: GroupInput[],
): Promise<QuestionGroup[]> {
  if (!groups.length) return [];

  const groupIds = groups.map((group) => group.id);
  const { data, error } = await supabase
    .from("group_question_suggestions")
    .select("group_id, question, position")
    .in("group_id", groupIds)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const byGroup = new Map<string, string[]>();
  if (!error) {
    for (const row of data ?? []) {
      const list = byGroup.get(row.group_id) ?? [];
      list.push(row.question);
      byGroup.set(row.group_id, list);
    }
  }

  return groups
    .map((group) => {
      const slug = group.slug ?? "";
      const questions = byGroup.get(group.id) ?? questionsForSlug(slug);
      return {
        id: group.id,
        label: group.name,
        slug,
        questions,
      };
    })
    .filter((group) => group.questions.length > 0);
}
