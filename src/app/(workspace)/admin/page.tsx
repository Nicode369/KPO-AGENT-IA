import Link from "next/link";
import { connection } from "next/server";

import { requireAdminUser } from "@/lib/auth/workspace";
import { getAdminGroups, getAdminInvitations, getAdminMembers } from "@/lib/admin/data";
import { getSecurityAlertCount } from "@/lib/admin/security";

export const instant = false;

export default async function AdminHomePage() {
  await connection();
  const { supabase, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);
  const [invitations, members, securityAlerts] = await Promise.all([
    getAdminInvitations(supabase, groups),
    getAdminMembers(supabase, groups),
    getSecurityAlertCount(isSuperadmin, adminGroupIds),
  ]);
  const now = new Date();
  const activeInvitations = invitations.filter(
    (invitation) =>
      !invitation.revoked_at && new Date(invitation.expires_at) > now,
  );
  const activeMembers = members.filter((member) => member.status === "active");

  return (
    <main className="admin-content">
      <h1>Control de acceso</h1>
      <p className="workspace-lead">Gestiona los grupos, las invitaciones y las membresías. Los permisos se validan en la base de datos aunque la interfaz no muestre la acción.</p>

      <section className="admin-stats" aria-label="Resumen">
        <Link className="admin-stat" href="/admin/groups">
          <span>Grupos</span>
          <strong>{groups.length}</strong>
          <small>Ver grupos</small>
        </Link>
        <Link className="admin-stat" href="/admin/invitations">
          <span>Invitaciones activas</span>
          <strong>{activeInvitations.length}</strong>
          <small>Generar o revocar</small>
        </Link>
        <Link className="admin-stat" href="/admin/users">
          <span>Miembros activos</span>
          <strong>{activeMembers.length}</strong>
          <small>Roles y estados</small>
        </Link>
        <Link className="admin-stat" href="/admin/security">
          <span>Alertas 24 h</span>
          <strong>{securityAlerts ?? "—"}</strong>
          <small>Bloqueos y rechazos</small>
        </Link>
      </section>

      <section className="admin-panel">
        <h2>Acceso</h2>
        <p>No hay registro público. Cada persona debe usar un código de invitación vigente y un correo individual. El código queda ligado al grupo y al rol.</p>
        <div className="admin-actions">
          <Link className="admin-button" href="/admin/documents">Gestionar documentos</Link>
          <Link className="admin-button admin-button-secondary" href="/admin/invitations">Crear invitación</Link>
          <Link className="admin-button admin-button-secondary" href="/admin/groups">Crear grupo</Link>
        </div>
      </section>
    </main>
  );
}
