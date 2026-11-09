import { describe, expect, it } from "vitest";

import { auditEventLabel, auditEventTone } from "./labels";

describe("auditEventLabel", () => {
  it("returns the Spanish label for known events", () => {
    expect(auditEventLabel("auth_login_success")).toBe("Inicio de sesión");
    expect(auditEventLabel("document_published")).toBe("Documento publicado");
    expect(auditEventLabel("profile_deleted")).toBe("Cuenta eliminada");
    expect(auditEventLabel("group_deleted")).toBe("Grupo eliminado");
  });

  it("falls back to a readable event name", () => {
    expect(auditEventLabel("custom_event")).toBe("custom event");
  });
});

describe("auditEventTone", () => {
  it("marks failures and revocations as errors", () => {
    expect(auditEventTone("auth_login_failed")).toBe("admin-tag-error");
    expect(auditEventTone("profile_sessions_revoked")).toBe("admin-tag-error");
  });

  it("marks blocked events as warnings", () => {
    expect(auditEventTone("auth_login_blocked")).toBe("admin-tag-warn");
  });

  it("marks successful changes as ok", () => {
    expect(auditEventTone("invitation_redeemed")).toBe("admin-tag-ok");
    expect(auditEventTone("document_published")).toBe("admin-tag-ok");
  });

  it("uses the muted tone for neutral events", () => {
    expect(auditEventTone("audit_export")).toBe("admin-tag-muted");
  });
});
