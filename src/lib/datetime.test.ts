import { describe, expect, it } from "vitest";

import {
  bogotaDayEndIso,
  bogotaDayStartIso,
  formatDate,
  formatDateOnly,
  formatDateTime,
} from "./datetime";

describe("formatDateTime", () => {
  it("renders UTC timestamps in Colombia time", () => {
    const value = formatDateTime("2026-11-09T03:25:35.000Z");
    expect(value).toContain("8/11/2026");
    expect(value).toMatch(/10:25/);
  });

  it("keeps invalid values readable", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("formatDate", () => {
  it("renders the Colombia calendar date", () => {
    expect(formatDate("2026-11-09T03:25:35.000Z")).toBe("8/11/2026");
  });
});

describe("formatDateOnly", () => {
  it("keeps date-only values on the same calendar day", () => {
    expect(formatDateOnly("2026-11-08")).toBe("8/11/2026");
  });
});

describe("Bogota day boundaries", () => {
  it("maps a local day to UTC instants", () => {
    expect(bogotaDayStartIso("2026-11-08")).toBe("2026-11-08T05:00:00.000Z");
    expect(bogotaDayEndIso("2026-11-08")).toBe("2026-11-09T04:59:59.999Z");
  });

  it("rejects invalid dates", () => {
    expect(bogotaDayStartIso("08/11/2026")).toBeNull();
    expect(bogotaDayEndIso("")).toBeNull();
  });
});
