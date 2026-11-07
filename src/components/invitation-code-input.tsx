"use client";

import { useState } from "react";

export function InvitationCodeInput() {
  const [value, setValue] = useState("");

  return (
    <input
      id="invitation_code"
      name="invitation_code"
      type="text"
      value={value}
      onChange={(event) => {
        const normalized = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        setValue(/^[A-F0-9]{48}$/.test(normalized) ? normalized : normalized.slice(0, 6));
      }}
      autoComplete="off"
      required
      minLength={6}
      maxLength={48}
      pattern="[A-Z0-9]{6}|[A-F0-9]{48}"
      title="6 caracteres en mayúsculas o código anterior de 48"
      spellCheck={false}
      autoCapitalize="characters"
      autoCorrect="off"
      inputMode="text"
      placeholder="Ej. 7K2M9P"
    />
  );
}
