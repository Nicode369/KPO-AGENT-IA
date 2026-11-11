import { describe, expect, it } from "vitest";

import { prepareAnswerMarkdown, stripLeadingAnswerLabel } from "./format";

describe("stripLeadingAnswerLabel", () => {
  it("removes bold and plain answer prefixes", () => {
    expect(stripLeadingAnswerLabel("**Respuesta**: La norma exige [1].")).toBe(
      "La norma exige [1].",
    );
    expect(stripLeadingAnswerLabel("Respuesta: La norma exige [1].")).toBe(
      "La norma exige [1].",
    );
    expect(stripLeadingAnswerLabel("answer: The rule requires [1].")).toBe(
      "The rule requires [1].",
    );
  });

  it("keeps labels that are part of the answer", () => {
    const answer = "La respuesta correcta exige [1].";
    expect(stripLeadingAnswerLabel(answer)).toBe(answer);
  });
});

describe("prepareAnswerMarkdown", () => {
  it("converts known citations into source links", () => {
    expect(prepareAnswerMarkdown("Exige validar [1] y documentar [2].", [1, 2])).toBe(
      "Exige validar [[1]](#agent-source-1) y documentar [[2]](#agent-source-2).",
    );
  });

  it("marks citations without a source as unknown", () => {
    expect(prepareAnswerMarkdown("Exige validar [7].", [1, 2])).toBe(
      "Exige validar [?].",
    );
  });

  it("leaves citations untouched when no sources are available", () => {
    expect(prepareAnswerMarkdown("Exige validar [1].")).toBe("Exige validar [1].");
  });

  it("normalizes line endings before formatting", () => {
    expect(prepareAnswerMarkdown("**Respuesta**: Uno.\r\n\r\nDos.")).toBe(
      "Uno.\n\nDos.",
    );
  });
});
