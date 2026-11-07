import Link from "next/link";

import { AuthFrame, AuthMessage } from "@/components/auth-frame";
import { InvitationCodeInput } from "@/components/invitation-code-input";
import { signUp } from "@/app/auth/actions";

export const instant = false;

export default async function RegisterPage({
  searchParams,
}: PageProps<"/register">) {
  const query = await searchParams;

  return (
    <AuthFrame
      title="Tu acceso empieza con una invitación."
      description="Crea tu cuenta personal. El código vincula el registro con el grupo que te invitó."
      footer={<>¿Ya tienes una cuenta? <Link href="/login">Inicia sesión</Link></>}
    >
      <AuthMessage code={query.error} />
      <form className="auth-form auth-form-compact" action={signUp}>
        <label htmlFor="full_name">Nombre completo</label>
        <input id="full_name" name="full_name" type="text" autoComplete="name" required minLength={2} maxLength={120} />
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <label htmlFor="invitation_code">Código de invitación <span>6 caracteres en mayúsculas</span></label>
        <InvitationCodeInput />
        <label htmlFor="password">Contraseña <span>Mínimo 6 caracteres</span></label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} maxLength={128} />
        <label htmlFor="password_confirmation">Confirma la contraseña</label>
        <input id="password_confirmation" name="password_confirmation" type="password" autoComplete="new-password" required minLength={6} maxLength={128} />
        <button type="submit">Crear cuenta</button>
      </form>
      <p className="auth-footnote">El acceso queda vinculado al grupo de la invitación.</p>
    </AuthFrame>
  );
}
