import { MembershipForm, ProfileActiveForm, RevokeSessionsForm } from "../admin-forms";
import { requireAdminUser } from "@/lib/auth/workspace";
import { getAdminGroups, getAdminMembers } from "@/lib/admin/data";

export const instant = false;

export default async function AdminUsersPage() {
  const { supabase, userId, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);
  const members = await getAdminMembers(supabase, groups);

  return (
    <main className="admin-content">
      <h1>Miembros y roles</h1>
      <p className="workspace-lead">Los cambios de rol y estado pasan por funciones protegidas. Un administrador de grupo no puede asignar el rol de administrador de grupo ni salir de su propio grupo.</p>

      <section className="admin-panel">
        <h2>Membresías</h2>
        {members.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-wide">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Grupo</th>
                  <th>Rol y estado</th>
                  <th>Cuenta</th>
                  <th>Sesiones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.full_name ?? "Sin nombre"}</strong>
                      <span className="admin-subtle">{member.email}</span>
                    </td>
                    <td>{member.group_name}</td>
                    <td>
                      <MembershipForm
                        membershipId={member.id}
                        role={member.role}
                        status={member.status}
                        canAssignGroupAdmin={isSuperadmin}
                      />
                    </td>
                    <td>
                      <span className={`admin-tag ${member.is_active ? "admin-tag-ok" : "admin-tag-muted"}`}>
                        {member.is_active ? "Activa" : "Inactiva"}
                      </span>
                      {isSuperadmin && member.user_id !== userId ? (
                        <ProfileActiveForm userId={member.user_id} isActive={member.is_active} />
                      ) : null}
                    </td>
                    <td>
                      {isSuperadmin && member.user_id !== userId ? (
                        <RevokeSessionsForm userId={member.user_id} />
                      ) : (
                        <span className="admin-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
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
