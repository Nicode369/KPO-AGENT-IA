import { CreateGroupForm } from "../admin-forms";
import { connection } from "next/server";
import { requireAdminUser } from "@/lib/auth/workspace";
import { getAdminGroups } from "@/lib/admin/data";

export const instant = false;

export default async function AdminGroupsPage() {
  await connection();
  const { supabase, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groups = await getAdminGroups(supabase, isSuperadmin, adminGroupIds);

  return (
    <main className="admin-content">
      <h1>Fronteras de acceso</h1>
      <p className="workspace-lead">Cada grupo define qué usuarios y documentos quedan aislados. El superadministrador puede ver todos los grupos; un administrador de grupo solo ve los suyos.</p>

      {isSuperadmin ? (
        <section className="admin-panel">
          <h2>Crear grupo</h2>
          <p>Usa un nombre visible y un identificador único en minúsculas.</p>
          <CreateGroupForm />
        </section>
      ) : null}

      <section className="admin-panel">
        <h2>Grupos disponibles</h2>
        {groups.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Identificador</th>
                  <th>Estado</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td><code>{group.slug}</code></td>
                    <td>{group.is_active ? "Activo" : "Inactivo"}</td>
                    <td>{new Date(group.created_at).toLocaleDateString("es-CO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No hay grupos todavía.</p>
        )}
      </section>
    </main>
  );
}
