import Link from "next/link";

import { roleLabel } from "@/lib/admin/data";
import { requireWorkspaceUser } from "@/lib/auth/workspace";

export const instant = false;

export default async function AppHomePage() {
  const { supabase, profile, memberships } = await requireWorkspaceUser();
  const groupIds = memberships.map((membership) => membership.group_id);
  const { data: groups } = groupIds.length
    ? await supabase.from("groups").select("id, name").in("id", groupIds)
    : { data: [] };
  const groupNames = new Map((groups ?? []).map((group) => [group.id, group.name]));
  const showAdmin =
    profile.is_superadmin ||
    memberships.some((membership) => membership.role === "group_admin");

  return (
    <main className="signed-in-content">
      <h1>Bienvenido{profile.full_name ? `, ${profile.full_name}` : ""}.</h1>
      <p className="workspace-lead">
        Tu sesión está activa. Los permisos y la biblioteca documental se conectarán en
        las siguientes etapas.
      </p>

      <section className="workspace-status" aria-label="Estado de la cuenta">
        <div>
          <span>Cuenta</span>
          <strong>Activa</strong>
        </div>
        <div>
          <span>Grupos</span>
          <strong>{memberships.length}</strong>
        </div>
        <div>
          <span>Acceso</span>
          <strong>{profile.is_superadmin ? "Superadmin" : "Por grupo"}</strong>
        </div>
      </section>

      <section className="membership-panel" aria-labelledby="membership-heading">
        <h2 id="membership-heading">
          {profile.is_superadmin ? "Acceso de superadministración" : "Tus grupos"}
        </h2>
        {profile.is_superadmin ? (
          <p>
            La cuenta tiene el rol global de superadministrador.{" "}
            {showAdmin ? <Link href="/admin">Abrir administración</Link> : null}
          </p>
        ) : memberships.length ? (
          <ul>
            {memberships.map((membership) => {
              return (
                <li key={membership.id}>
                  <strong>{groupNames.get(membership.group_id) ?? "Grupo"}</strong>
                  <span className="role-tag">{roleLabel(membership.role)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No hay grupos activos vinculados a esta cuenta.</p>
        )}
      </section>

      {showAdmin ? (
        <div className="workspace-actions">
          <Link className="button button-secondary" href="/admin">
            Administrar grupos, invitaciones y usuarios
          </Link>
        </div>
      ) : (
        <p className="workspace-footnote">La consulta documental aún no está habilitada.</p>
      )}
    </main>
  );
}
