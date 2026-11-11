import { describe, expect, it } from "vitest";

import { questionsForSlug } from "./question-suggestions";

describe("question suggestions", () => {
  it("returns the seeded questions for KPO and climate", () => {
    expect(questionsForSlug("kpo")).toHaveLength(8);
    expect(questionsForSlug("riesgo-climatico")).toHaveLength(6);
    expect(questionsForSlug("kpo")[0]).toMatch(/NIA/);
    expect(questionsForSlug("riesgo-climatico")[0]).toMatch(/POT/);
  });

  it("returns an empty list for unknown or missing slugs", () => {
    expect(questionsForSlug("grupo-desconocido")).toEqual([]);
    expect(questionsForSlug(null)).toEqual([]);
  });
});
