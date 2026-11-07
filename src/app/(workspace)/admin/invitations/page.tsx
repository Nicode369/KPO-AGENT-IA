import { connection } from "next/server";

import { CopyCodeButton, CreateInvitationForm, RevokeInvitationForm } from "../admin-forms";
import { requireAdminUser } from "@/lib/auth/workspace";
import { getAdminGroups, getAdminInvitations, getDefaultInvitationExpiry, roleLabel } from "@/lib/admin/data";

export const instant = false;

function expiryLabel(expiresAt: string, revokedAt: string | null, now: Date) {
  if (revokedAt) return "Revocada";
  if (new Date(expiresAt) <= now) return "Expirada";
  return "Vigente";
}

export default async function AdminInvitationsPage() {
  await connection();
  const { supabase, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);
  const invitations = await getAdminInvitations(supabase, groups);
  const now = new Date();
  const defaultExpiry = getDefaultInvitationExpiry(now);

  return (
    <main className="admin-content">
      <h1>Acceso por código</h1>
      <p className="workspace-lead">El código de 6 letras y números en mayúsculas queda asociado a un grupo y un rol. El historial conserva el código para que puedas compartirlo de nuevo; solo lo ven los administradores del grupo.</p>

      {groups.length ? (
        <section className="admin-panel">
          <h2>Generar invitación</h2>
          <CreateInvitationForm
            groups={groups.map((group) => ({ id: group.id, name: group.name }))}
            defaultExpiry={defaultExpiry}
            canAssignGroupAdmin={isSuperadmin}
          />
        </section>
      ) : (
        <section className="admin-panel">
          <h2>Generar invitación</h2>
          <p>Primero crea un grupo.</p>
        </section>
      )}

      <section className="admin-panel">
        <h2>Historial de invitaciones</h2>
        {invitations.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Código</th>
                  <th>Rol</th>
                  <th>Usos</th>
                  <th>Expira</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const status = expiryLabel(
                    invitation.expires_at,
                    invitation.revoked_at,
                    now,
                  );
                  return (
                    <tr key={invitation.invitation_id}>
                      <td>{invitation.group_name}</td>
                      <td>
                        {invitation.code ? (
                          <span className="admin-code-cell">
                            <code>{invitation.code}</code>
                            <CopyCodeButton code={invitation.code} />
                          </span>
                        ) : (
                          <span className="admin-muted">No disponible</span>
                        )}
                      </td>
                      <td>{roleLabel(invitation.role)}</td>
                      <td>{invitation.use_count} / {invitation.max_uses}</td>
                      <td>{new Date(invitation.expires_at).toLocaleDateString("es-CO")}</td>
                      <td><span className={`admin-tag ${status === "Vigente" ? "admin-tag-ok" : "admin-tag-muted"}`}>{status}</span></td>
                      <td>
                        {status === "Vigente" ? (
                          <RevokeInvitationForm invitationId={invitation.invitation_id} />
                        ) : (
                          <span className="admin-muted">Sin acción</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {invitations.some((invitation) => !invitation.code) ? (
              <p className="admin-subtle">Las invitaciones creadas antes de la actualización no tienen código guardado. Genera una nueva para verla y copiarla aquí.</p>
            ) : null}
          </div>
        ) : (
          <p>No hay invitaciones todavía.</p>
        )}
      </section>
    </main>
  );
}
