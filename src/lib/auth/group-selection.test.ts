import { describe, expect, it } from "vitest";

import { selectActiveGroup } from "./group-selection";

const groups = [
  { id: "grupo-a", name: "Grupo A" },
  { id: "grupo-b", name: "Grupo B" },
  { id: "kpo", name: "KPO" },
];

describe("selectActiveGroup", () => {
  it("returns null when there are no groups", () => {
    expect(selectActiveGroup([])).toBeNull();
    expect(selectActiveGroup([], "kpo")).toBeNull();
  });

  it("uses the requested group when it exists", () => {
    expect(selectActiveGroup(groups, "grupo-b")?.id).toBe("grupo-b");
  });

  it("falls back to KPO when the requested group is missing", () => {
    expect(selectActiveGroup(groups, "missing")?.id).toBe("kpo");
  });

  it("prefers KPO by default", () => {
    expect(selectActiveGroup(groups)?.id).toBe("kpo");
  });

  it("falls back to the first group when KPO is not available", () => {
    expect(
      selectActiveGroup([groups[0], groups[1]])?.id,
    ).toBe("grupo-a");
  });
});
