import Link from "next/link";

import { AuthFrame, AuthMessage } from "@/components/auth-frame";
import { signIn } from "@/app/auth/actions";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const query = await searchParams;

  return (
    <AuthFrame
      title="Qué bueno tenerte de vuelta."
      description="Ingresa con tu cuenta individual para continuar al espacio de tu grupo."
      footer={<>¿Aún no tienes una cuenta? <Link href="/register">Regístrate con una invitación</Link></>}
    >
      <AuthMessage code={query.error} />
      {query.updated && <p className="auth-success" role="status">Contraseña actualizada. Ya puedes iniciar sesión.</p>}
      <form className="auth-form" action={signIn}>
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <div className="field-label-row">
          <label htmlFor="password">Contraseña</label>
          <Link href="/forgot-password">¿La olvidaste?</Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit">Iniciar sesión</button>
      </form>
    </AuthFrame>
  );
}
