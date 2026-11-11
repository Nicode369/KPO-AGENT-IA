import { describe, expect, it } from "vitest";

import {
  HISTORY_OUTCOMES,
  OUTCOME_LABELS,
  OUTCOME_TONES,
} from "./labels";

describe("agent outcome labels", () => {
  it("lists all history outcomes", () => {
    expect(HISTORY_OUTCOMES).toEqual([
      "answered",
      "insufficient_evidence",
      "out_of_scope",
      "rejected",
      "blocked",
      "error",
    ]);
  });

  it("defines a label and a distinct tone for every outcome", () => {
    for (const outcome of HISTORY_OUTCOMES) {
      expect(OUTCOME_LABELS[outcome]).toBeTruthy();
      expect(OUTCOME_TONES[outcome]).toMatch(/^outcome-tag-/);
    }

    const tones = HISTORY_OUTCOMES.map((outcome) => OUTCOME_TONES[outcome]);
    expect(new Set(tones).size).toBe(HISTORY_OUTCOMES.length);
  });
});
