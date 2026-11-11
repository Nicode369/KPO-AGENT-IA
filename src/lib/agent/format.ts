const LEADING_ANSWER_LABEL =
  /^\s*(?:\*\*)?(?:respuesta|answer)(?:\*\*)?\s*:\s*/i;

export function stripLeadingAnswerLabel(answer: string): string {
  return answer.replace(LEADING_ANSWER_LABEL, "").trimStart();
}

export function prepareAnswerMarkdown(
  answer: string,
  sourceRanks?: readonly number[],
): string {
  const normalized = stripLeadingAnswerLabel(answer.replace(/\r\n?/g, "\n"));
  if (!sourceRanks) return normalized;

  const validRanks = new Set(sourceRanks);
  return normalized.replace(/\[(\d{1,2})\]/g, (match, value: string) => {
    const rank = Number(value);
    return validRanks.has(rank) ? `[[${rank}]](#agent-source-${rank})` : "[?]";
  });
}
