import Link from "next/link";
import { connection } from "next/server";

import { AgentConsole } from "@/components/agent-console";

import { roleLabel } from "@/lib/admin/data";
import { demoVariantForEmail } from "@/lib/auth/demo";
import { demoCopy } from "@/lib/demo/variants";
import { getSuperadminGroupContext } from "@/lib/auth/group-context";
import { requireWorkspaceUser } from "@/lib/auth/workspace";

import { setActiveGroupAction } from "./actions";

export const instant = false;

type SearchParams = Promise<{ group_error?: string }>;

export default async function AppHomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await searchParams;
  const { supabase, profile, memberships } = await requireWorkspaceUser();
  const groupContext = profile.is_superadmin
    ? await getSuperadminGroupContext(supabase, true)
    : null;
  const activeGroup = groupContext?.activeGroup ?? null;
  const groupIds = profile.is_superadmin
    ? activeGroup
      ? [activeGroup.id]
      : []
    : memberships.map((membership) => membership.group_id);

  let groups: { id: string; name: string }[] = [];
  if (profile.is_superadmin) {
    groups = groupContext?.groups ?? [];
  } else if (groupIds.length) {
    const { data } = await supabase
      .from("groups")
      .select("id, name")
      .in("id", groupIds);
    groups = (data ?? []) as { id: string; name: string }[];
  }

  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const showAdmin =
    profile.is_superadmin ||
    memberships.some((membership) => membership.role === "group_admin");
  const demo = demoCopy(demoVariantForEmail(profile.email));

  return (
    <main className="signed-in-content">
      <h1>Bienvenido{profile.full_name ? `, ${profile.full_name}` : ""}.</h1>
      <p className="workspace-lead">
        Consulta la biblioteca documental de tus grupos. El asistente responde solo con
        normas aprobadas y publicadas, y muestra la fuente de cada afirmación.
      </p>

      <section className="workspace-status" aria-label="Estado de la cuenta">
        <div>
          <span>Cuenta</span>
          <strong>Activa</strong>
        </div>
        <div>
          <span>{profile.is_superadmin ? "Grupos disponibles" : "Grupos"}</span>
          <strong>
            {profile.is_superadmin ? groups.length : memberships.length}
          </strong>
        </div>
        <div>
          <span>{profile.is_superadmin ? "Grupo activo" : "Acceso"}</span>
          <strong>
            {profile.is_superadmin
              ? activeGroup?.name ?? "Sin grupo"
              : "Por grupo"}
          </strong>
        </div>
      </section>

      <section className="membership-panel" aria-labelledby="membership-heading">
        <h2 id="membership-heading">
          {profile.is_superadmin ? "Acceso de superadministración" : "Tus grupos"}
        </h2>
        {profile.is_superadmin ? (
          <>
            <p>
              La cuenta tiene el rol global de superadministrador. Elige el grupo
              activo: las consultas se registran en ese grupo y solo usan sus
              documentos publicados más los documentos comunes.
            </p>
            {params.group_error ? (
              <p className="admin-message admin-message-error" role="alert">
                No se pudo cambiar el grupo activo. Intenta de nuevo.
              </p>
            ) : null}
            {groups.length ? (
              <form className="group-context-form" action={setActiveGroupAction}>
                <div className="admin-field">
                  <label htmlFor="active-group">Grupo activo</label>
                  <select
                    id="active-group"
                    name="group_id"
                    defaultValue={activeGroup?.id ?? groups[0].id}
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="admin-button" type="submit">
                  Aplicar grupo
                </button>
              </form>
            ) : (
              <p>
                No hay grupos creados. Crea uno desde administración para habilitar
                consultas por grupo.
              </p>
            )}
            <p>
              <Link href="/admin">Abrir administración</Link>
            </p>
          </>
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

      <AgentConsole
        suggestions={demo?.suggestions}
        intro={demo?.intro}
      />

      {showAdmin ? (
        <div className="workspace-actions">
          <Link className="button button-secondary" href="/admin">
            Administrar grupos, invitaciones y usuarios
          </Link>
          <Link className="button button-secondary" href="/admin/documents">
            Gestionar documentos
          </Link>
        </div>
      ) : null}
    </main>
  );
}
