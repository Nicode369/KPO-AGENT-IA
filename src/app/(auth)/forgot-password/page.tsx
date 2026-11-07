import Link from "next/link";

import { AuthFrame, AuthMessage } from "@/components/auth-frame";
import { requestPasswordReset } from "@/app/auth/actions";

export const instant = false;

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const query = await searchParams;

  return (
    <AuthFrame
      title="Recupera tu acceso."
      description="Te enviaremos un enlace para elegir una contraseña nueva."
      footer={<>¿Recordaste la contraseña? <Link href="/login">Volver a iniciar sesión</Link></>}
    >
      <AuthMessage code={query.error} />
      {query.sent && <p className="auth-success" role="status">Si existe una cuenta para ese correo, recibirás un enlace de recuperación.</p>}
      <form className="auth-form" action={requestPasswordReset}>
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <button type="submit">Enviar enlace</button>
      </form>
    </AuthFrame>
  );
}
