export const AUDIT_EVENT_LABELS: Record<string, string> = {
  user_registered: "Usuario registrado",
  auth_login_success: "Inicio de sesión",
  auth_login_failed: "Inicio de sesión fallido",
  auth_login_blocked: "Inicio de sesión bloqueado",
  auth_logout: "Cierre de sesión",
  auth_signup_failed: "Registro fallido",
  auth_password_reset_requested: "Recuperación de contraseña solicitada",
  auth_password_reset_failed: "Recuperación de contraseña fallida",
  auth_password_updated: "Contraseña actualizada",
  auth_password_update_failed: "Actualización de contraseña fallida",
  auth_password_recovery_started: "Recuperación de contraseña iniciada",
  auth_email_verified: "Correo verificado",
  auth_callback_failed: "Callback de autenticación fallido",
  authorization_denied: "Acceso no autorizado",
  group_created: "Grupo creado",
  group_activated: "Grupo activado",
  group_deactivated: "Grupo desactivado",
  invitation_created: "Invitación creada",
  invitation_revoked: "Invitación revocada",
  invitation_redeemed: "Invitación utilizada",
  membership_created: "Membresía creada",
  membership_role_changed: "Rol actualizado",
  membership_status_changed: "Estado de membresía actualizado",
  profile_activated: "Cuenta activada",
  profile_deactivated: "Cuenta desactivada",
  profile_sessions_revoked: "Sesiones revocadas",
  superadmin_granted: "Superadmin otorgado",
  superadmin_revoked: "Superadmin retirado",
  document_uploaded: "Documento cargado",
  document_processing: "Documento en procesamiento",
  document_processed: "Documento procesado",
  document_error: "Error de procesamiento",
  document_approved: "Documento aprobado",
  document_rejected: "Documento rechazado",
  document_published: "Documento publicado",
  document_retired: "Documento retirado",
  document_metadata_updated: "Metadatos actualizados",
  document_access_updated: "Acceso documental actualizado",
  document_version_created: "Nueva versión documental",
  audit_export: "Exportación de auditoría",
  audit_integrity_check: "Verificación de integridad",
  audit_integrity_failed: "Fallo de integridad de auditoría",
};

export function auditEventLabel(eventType: string): string {
  return AUDIT_EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ");
}

export function auditEventTone(eventType: string): string {
  if (
    /failed|denied|deactivated|revoked|error|rejected|retired/.test(eventType)
  ) {
    return "admin-tag-error";
  }
  if (/blocked|warning/.test(eventType)) {
    return "admin-tag-warn";
  }
  if (
    /success|created|activated|published|approved|registered|verified|updated|redeemed/.test(
      eventType,
    )
  ) {
    return "admin-tag-ok";
  }
  return "admin-tag-muted";
}

export const AUDIT_EVENT_TYPES = Object.keys(AUDIT_EVENT_LABELS).sort();
