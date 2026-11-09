import { describe, expect, it } from "vitest";

import { deleteUserBlockedReason } from "./users";

describe("deleteUserBlockedReason", () => {
  it("blocks deleting the current account", () => {
    expect(
      deleteUserBlockedReason(
        { id: "user-1", is_superadmin: false },
        "user-1",
      ),
    ).toBe("No puedes eliminar tu propia cuenta.");
  });

  it("blocks deleting superadministrators", () => {
    expect(
      deleteUserBlockedReason(
        { id: "user-2", is_superadmin: true },
        "user-1",
      ),
    ).toBe("No se puede eliminar una cuenta superadministradora.");
  });

  it("allows deleting another regular account", () => {
    expect(
      deleteUserBlockedReason(
        { id: "user-2", is_superadmin: false },
        "user-1",
      ),
    ).toBeNull();
  });
});
