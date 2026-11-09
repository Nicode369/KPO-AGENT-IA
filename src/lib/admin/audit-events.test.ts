import { describe, expect, it } from "vitest";

import {
  normalizeAuditEventType,
  normalizeAuditLogFilters,
} from "./audit-events";

describe("normalizeAuditEventType", () => {
  it("keeps valid snake_case event types", () => {
    expect(normalizeAuditEventType("auth_login_success")).toBe(
      "auth_login_success",
    );
    expect(normalizeAuditEventType("document_published")).toBe(
      "document_published",
    );
  });

  it("drops invalid event types", () => {
    expect(normalizeAuditEventType("Auth-Login")).toBe("");
    expect(normalizeAuditEventType("with space")).toBe("");
    expect(normalizeAuditEventType("")).toBe("");
  });
});

describe("normalizeAuditLogFilters", () => {
  it("normalizes text, dates and actor search", () => {
    const filters = normalizeAuditLogFilters(
      {
        q: "  analyst@kpo.co,admin@kpo.co ",
        eventType: " auth_login_success ",
        groupId: "group-a",
        from: "2026-11-01",
        to: "08/11/2026",
      },
      true,
      [],
    );

    expect(filters).toEqual({
      q: "analyst@kpo.co admin@kpo.co",
      eventType: "auth_login_success",
      groupId: "group-a",
      from: "2026-11-01",
      to: "",
    });
  });

  it("enforces group scope for group admins", () => {
    const filters = normalizeAuditLogFilters(
      {
        q: "x".repeat(300),
        eventType: "not valid",
        groupId: "group-b",
        from: "",
        to: "",
      },
      false,
      ["group-a"],
    );

    expect(filters.q).toHaveLength(200);
    expect(filters.eventType).toBe("");
    expect(filters.groupId).toBe("");
  });
});
