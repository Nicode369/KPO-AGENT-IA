import { describe, expect, it } from "vitest";

import { resolveAnswerOutcome } from "./outcome";

describe("resolveAnswerOutcome", () => {
  it("marks queries without relevant sources as out of scope", () => {
    expect(
      resolveAnswerOutcome({
        hasSources: false,
        modelAbstained: false,
        hasCitations: false,
      }),
    ).toEqual({ outcome: "out_of_scope", outcomeReason: "no_relevant_sources" });
  });

  it("marks model abstentions as insufficient evidence", () => {
    expect(
      resolveAnswerOutcome({
        hasSources: true,
        modelAbstained: true,
        hasCitations: true,
      }),
    ).toEqual({
      outcome: "insufficient_evidence",
      outcomeReason: "model_abstained",
    });
  });

  it("marks answers without valid citations as insufficient evidence", () => {
    expect(
      resolveAnswerOutcome({
        hasSources: true,
        modelAbstained: false,
        hasCitations: false,
      }),
    ).toEqual({
      outcome: "insufficient_evidence",
      outcomeReason: "citation_validation_failed",
    });
  });

  it("marks grounded answers with citations as answered", () => {
    expect(
      resolveAnswerOutcome({
        hasSources: true,
        modelAbstained: false,
        hasCitations: true,
      }),
    ).toEqual({ outcome: "answered", outcomeReason: null });
  });
});
