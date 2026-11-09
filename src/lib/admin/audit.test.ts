import { describe, expect, it } from "vitest";

import {
  normalizeAuditDate,
  normalizeAuditFilters,
  normalizeAuditGroupId,
  normalizeAuditOutcome,
  normalizeAuditPage,
  normalizeAuditUser,
} from "./audit";

describe("normalizeAuditOutcome", () => {
  it("keeps allowed outcomes", () => {
    expect(normalizeAuditOutcome("answered")).toBe("answered");
    expect(normalizeAuditOutcome("insufficient_evidence")).toBe(
      "insufficient_evidence",
    );
    expect(normalizeAuditOutcome("out_of_scope")).toBe("out_of_scope");
  });

  it("drops unknown outcomes", () => {
    expect(normalizeAuditOutcome("delete_everything")).toBe("");
    expect(normalizeAuditOutcome("")).toBe("");
  });
});

describe("normalizeAuditGroupId", () => {
  it("lets superadmins filter by any group", () => {
    expect(normalizeAuditGroupId("group-a", true, [])).toBe("group-a");
  });

  it("restricts group admins to their groups", () => {
    expect(normalizeAuditGroupId("group-a", false, ["group-a"])).toBe("group-a");
    expect(normalizeAuditGroupId("group-b", false, ["group-a"])).toBe("");
  });

  it("returns empty when no group is selected", () => {
    expect(normalizeAuditGroupId("", true, [])).toBe("");
  });
});

describe("normalizeAuditUser", () => {
  it("trims and limits the user search", () => {
    expect(normalizeAuditUser("  analyst@kpo.co  ")).toBe("analyst@kpo.co");
    expect(normalizeAuditUser("a".repeat(300))).toHaveLength(200);
  });
});

describe("normalizeAuditDate", () => {
  it("accepts ISO dates only", () => {
    expect(normalizeAuditDate("2026-11-08")).toBe("2026-11-08");
    expect(normalizeAuditDate("08/11/2026")).toBe("");
    expect(normalizeAuditDate("")).toBe("");
  });
});

describe("normalizeAuditPage", () => {
  it("defaults to the first page", () => {
    expect(normalizeAuditPage(undefined)).toBe(1);
    expect(normalizeAuditPage("0")).toBe(1);
    expect(normalizeAuditPage("abc")).toBe(1);
  });

  it("parses valid page numbers and arrays", () => {
    expect(normalizeAuditPage("3")).toBe(3);
    expect(normalizeAuditPage(["2", "9"])).toBe(2);
  });
});

describe("normalizeAuditFilters", () => {
  it("normalizes every field and enforces group scope", () => {
    const filters = normalizeAuditFilters(
      {
        q: "  factura ",
        outcome: "blocked",
        groupId: "group-b",
        user: "  analyst@kpo.co ",
        from: "2026-11-01",
        to: "invalid",
      },
      false,
      ["group-a"],
    );

    expect(filters).toEqual({
      q: "factura",
      outcome: "blocked",
      groupId: "",
      user: "analyst@kpo.co",
      from: "2026-11-01",
      to: "",
    });
  });
});
