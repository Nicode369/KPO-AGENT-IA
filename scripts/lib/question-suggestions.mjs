export async function seedQuestionSuggestions(service, group, questions) {
  if (!Array.isArray(questions) || !questions.length) return 0;

  const { data: existing, error: readError } = await service
    .from("group_question_suggestions")
    .select("id, question")
    .eq("group_id", group.id);
  if (readError) {
    throw new Error(
      `No se pudieron leer las preguntas de ${group.name}: ${readError.message}`,
    );
  }

  const now = new Date().toISOString();
  const rows = questions.map((question, index) => ({
    group_id: group.id,
    question,
    position: index,
    is_active: true,
    updated_at: now,
  }));

  const { error: upsertError } = await service
    .from("group_question_suggestions")
    .upsert(rows, { onConflict: "group_id,question" });
  if (upsertError) {
    throw new Error(
      `No se pudieron sembrar las preguntas de ${group.name}: ${upsertError.message}`,
    );
  }

  const current = new Set(questions);
  const stale = (existing ?? [])
    .filter((row) => !current.has(row.question))
    .map((row) => row.id);

  if (stale.length) {
    const { error: deleteError } = await service
      .from("group_question_suggestions")
      .delete()
      .in("id", stale);
    if (deleteError) {
      throw new Error(
        `No se pudieron retirar preguntas antiguas de ${group.name}: ${deleteError.message}`,
      );
    }
  }

  return rows.length;
}
