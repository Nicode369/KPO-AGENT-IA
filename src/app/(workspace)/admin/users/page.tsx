import { DeleteUserForm, MembershipForm, ProfileActiveForm } from "../admin-forms";
import { connection } from "next/server";
import { requireAdminUser } from "@/lib/auth/workspace";
import { getAdminGroups, getAdminMembers } from "@/lib/admin/data";
import { isServiceRoleConfigured } from "@/lib/supabase/service";

export const instant = false;

export default async function AdminUsersPage() {
  await connection();
  const { supabase, userId, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);
  const members = await getAdminMembers(supabase, groups);
  const canDeleteAccounts = isSuperadmin && isServiceRoleConfigured();
  const firstMembershipIdByUser = new Map<string, string>();
  for (const member of members) {
    if (!firstMembershipIdByUser.has(member.user_id)) {
      firstMembershipIdByUser.set(member.user_id, member.id);
    }
  }

  return (
    <main className="admin-content">
      <h1>Miembros y roles</h1>
      <p className="workspace-lead">Los cambios de rol y estado pasan por funciones protegidas. Un administrador de grupo no puede asignar el rol de administrador de grupo ni salir de su propio grupo.</p>

      <section className="admin-panel">
        <h2>Membresías</h2>
        {members.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-wide users-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Grupo</th>
                  <th>Rol y membresía</th>
                  <th>Cuenta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const displayName = member.full_name ?? member.email;
                  const initials = displayName.trim().slice(0, 2).toUpperCase();
                  const showDelete =
                    isSuperadmin &&
                    canDeleteAccounts &&
                    member.user_id !== userId &&
                    firstMembershipIdByUser.get(member.user_id) === member.id;

                  return (
                    <tr key={member.id}>
                      <td>
                        <div className="admin-user-cell">
                          <span className="admin-user-avatar" aria-hidden="true">{initials}</span>
                          <div className="admin-user-meta">
                            <strong>{member.full_name ?? "Sin nombre"}</strong>
                            <span className="admin-subtle">{member.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="admin-group-chip">{member.group_name}</span>
                      </td>
                      <td>
                        <MembershipForm
                          membershipId={member.id}
                          role={member.role}
                          status={member.status}
                          canAssignGroupAdmin={isSuperadmin}
                        />
                      </td>
                      <td>
                        <div className="admin-status-cell">
                          <span className={`admin-tag ${member.is_active ? "admin-tag-ok" : "admin-tag-muted"}`}>
                            {member.is_active ? "Activa" : "Inactiva"}
                          </span>
                          {isSuperadmin && member.user_id !== userId ? (
                            <ProfileActiveForm userId={member.user_id} isActive={member.is_active} />
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {showDelete ? (
                          <DeleteUserForm userId={member.user_id} email={member.email} name={member.full_name} />
                        ) : (
                          <span className="admin-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No hay membresías todavía. Crea una invitación y comparte el código.</p>
        )}
      </section>
    </main>
  );
}
