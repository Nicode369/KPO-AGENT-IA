import Link from "next/link";

import { AuthFrame } from "@/components/auth-frame";
import { MailIcon } from "@/components/icons";

export default function VerifyEmailPage() {
  return (
    <AuthFrame
      title="Revisa tu correo."
      description="Si el registro pudo completarse, Supabase enviará un enlace para verificar la dirección. Al verificarla, se activará tu pertenencia al grupo."
      footer={<>¿Ya verificaste tu correo? <Link href="/login">Iniciar sesión</Link></>}
    >
      <div className="auth-confirmation" role="status">
        <MailIcon size={19} />
        <p>El enlace de verificación puede tardar unos minutos. Revisa también la carpeta de correo no deseado.</p>
      </div>
    </AuthFrame>
  );
}
