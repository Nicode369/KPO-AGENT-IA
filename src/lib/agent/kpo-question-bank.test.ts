import { describe, expect, it } from "vitest";

import bank from "../../../data/kpo-question-bank.json";

import { classifyQuestion } from "./security";

type BankCase = (typeof bank)[number];

const cases = bank as BankCase[];

describe("KPO question bank", () => {
  it("contains 50 unique cases with the expected distribution", () => {
    expect(cases).toHaveLength(50);
    expect(new Set(cases.map((item) => item.id)).size).toBe(50);

    const byCategory = cases.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {});
    expect(byCategory).toEqual({ E: 30, F: 10, J: 10 });

    const byOutcome = cases.reduce<Record<string, number>>((counts, item) => {
      counts[item.expectedOutcome] = (counts[item.expectedOutcome] ?? 0) + 1;
      return counts;
    }, {});
    expect(byOutcome).toEqual({
      answered: 16,
      insufficient_evidence: 14,
      out_of_scope: 10,
      blocked: 10,
    });
  });

  it("blocks every jailbreak attempt", () => {
    for (const item of cases.filter((entry) => entry.category === "J")) {
      const result = classifyQuestion(item.question);
      expect(result, `case ${item.id}`).not.toBeNull();
      expect(result?.action, `case ${item.id}`).toBe("block");
    }
  });

  it("does not block standard or out-of-scope questions", () => {
    for (const item of cases.filter((entry) => entry.category !== "J")) {
      expect(classifyQuestion(item.question), `case ${item.id}`).toBeNull();
    }
  });
});
