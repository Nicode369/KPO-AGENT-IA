import { describe, expect, it } from "vitest";

import { buildCsv, escapeCsvValue } from "./csv";

describe("escapeCsvValue", () => {
  it("keeps plain values untouched", () => {
    expect(escapeCsvValue("analyst@kpo.co")).toBe("analyst@kpo.co");
    expect(escapeCsvValue(42)).toBe("42");
    expect(escapeCsvValue(true)).toBe("true");
  });

  it("quotes values with separators, quotes or newlines", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue("line 1\nline 2")).toBe('"line 1\nline 2"');
  });

  it("serializes objects and empty values", () => {
    expect(escapeCsvValue({ ok: true })).toBe('"{""ok"":true}"');
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });
});

describe("buildCsv", () => {
  it("writes a header and one line per row", () => {
    const csv = buildCsv(
      [
        { key: "event", label: "Evento" },
        { key: "actor", label: "Actor" },
      ],
      [
        { event: "auth_login_success", actor: "analyst@kpo.co" },
        { event: "audit_export", actor: null },
      ],
    );

    expect(csv).toBe(
      "Evento,Actor\r\nauth_login_success,analyst@kpo.co\r\naudit_export,",
    );
  });
});
