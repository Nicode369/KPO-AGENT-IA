import type { ReactNode } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export function AuthFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Link className="auth-brand" href="/" aria-label="RAG Agent AI, inicio">
          <BrandMark />
          <span>RAG <i>/</i> AGENT</span>
        </Link>
        <div className="auth-aside-body">
          <p className="auth-aside-title">La evidencia guía cada respuesta.</p>
          <p className="auth-aside-copy">
            Consulta documental con permisos por grupo, trazabilidad y fuentes
            verificables para auditoría, contabilidad y cumplimiento.
          </p>
        </div>
        <div className="auth-aside-meta">
          <span className="auth-aside-mark" aria-hidden="true" />
          <span>Acceso individual · Colombia</span>
        </div>
      </aside>
      <section className="auth-main">
        <div className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-rule" aria-hidden="true" />
            <h1>{title}</h1>
            <p className="auth-description">{description}</p>
            {children}
            <div className="auth-footer">{footer}</div>
          </div>
          <p className="auth-legal">Acceso individual · Fuentes sujetas a autorización</p>
        </div>
      </section>
    </main>
  );
}

export function AuthMessage({ code }: { code?: string | string[] }) {
  if (!code) return null;
  const normalizedCode = Array.isArray(code) ? code[0] : code;

  const messages: Record<string, string> = {
    not_configured: "Falta conectar Supabase. Configura las variables indicadas en .env.example.",
    credentials: "No se pudo iniciar sesión. Revisa el correo y la contraseña.",
    inactive: "La cuenta aún no está activa o no tiene acceso a un grupo. Contacta al administrador.",
    session_revoked: "Tu sesión fue revocada por un administrador. Inicia sesión de nuevo.",
    invalid_form: "Completa los campos requeridos y usa una contraseña de al menos 6 caracteres.",
    password_mismatch: "Las contraseñas no coinciden.",
    registration_failed: "No se pudo completar el registro. Inténtalo de nuevo en unos minutos.",
    registration_database: "La base de datos rechazó el registro. Verifica que el código sea válido, no esté usado y no haya expirado.",
    invalid_invitation: "El código de invitación no es válido, ya se usó o expiró. Pide uno nuevo al administrador.",
    email_rate_limit: "Supabase alcanzó el límite temporal de envío de correos. Espera unos minutos e inténtalo de nuevo.",
    email_taken: "Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.",
    signup_disabled: "El registro está deshabilitado temporalmente. Contacta al administrador.",
    invalid_email: "Revisa el correo electrónico.",
    invalid_link: "El enlace no es válido o ya venció. Solicita uno nuevo.",
    request_failed: "No se pudo enviar la solicitud. Inténtalo de nuevo más tarde.",
    weak_password: "La contraseña no cumple la política de Supabase. Usa al menos la longitud mínima configurada (6 en la app).",
    update_failed: "No se pudo actualizar la contraseña. Solicita un nuevo enlace.",
    demo_unavailable: "La demo solicitada no está disponible en este momento. Inténtalo más tarde.",
  };
  const message = messages[normalizedCode];
  return message ? <p className="auth-message" role="alert">{message}</p> : null;
}
