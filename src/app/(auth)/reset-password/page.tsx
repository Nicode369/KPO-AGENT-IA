import Link from "next/link";

import { AuthFrame, AuthMessage } from "@/components/auth-frame";
import { updatePassword } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const instant = false;

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const query = await searchParams;
  let hasRecoverySession = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    hasRecoverySession = typeof data?.claims?.sub === "string";
  }

  return (
    <AuthFrame
      title="Elige una contraseña nueva."
      description="Usa una contraseña única de al menos 6 caracteres."
      footer={<>¿Necesitas ayuda? <Link href="/forgot-password">Solicita otro enlace</Link></>}
    >
      <AuthMessage code={query.error} />
      {!hasRecoverySession ? (
        <p className="auth-message" role="alert">Abre el enlace de recuperación que enviamos a tu correo para continuar.</p>
      ) : (
        <form className="auth-form" action={updatePassword}>
          <label htmlFor="password">Contraseña nueva</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} maxLength={128} />
          <label htmlFor="password_confirmation">Confirma la contraseña</label>
          <input id="password_confirmation" name="password_confirmation" type="password" autoComplete="new-password" required minLength={6} maxLength={128} />
          <button type="submit">Actualizar contraseña</button>
        </form>
      )}
    </AuthFrame>
  );
}
