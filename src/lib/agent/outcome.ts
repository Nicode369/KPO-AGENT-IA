import type { AgentOutcome } from "./types";

export type AnswerOutcomeResolution = {
  outcome: AgentOutcome;
  outcomeReason: string | null;
};

export function resolveAnswerOutcome(input: {
  hasSources: boolean;
  modelAbstained: boolean;
  hasCitations: boolean;
}): AnswerOutcomeResolution {
  if (!input.hasSources) {
    return { outcome: "out_of_scope", outcomeReason: "no_relevant_sources" };
  }
  if (input.modelAbstained) {
    return { outcome: "insufficient_evidence", outcomeReason: "model_abstained" };
  }
  if (!input.hasCitations) {
    return {
      outcome: "insufficient_evidence",
      outcomeReason: "citation_validation_failed",
    };
  }
  return { outcome: "answered", outcomeReason: null };
}
