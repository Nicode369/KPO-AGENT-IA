#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const LEGACY_SLUGS = new Set(["a", "b", "grupo-a", "grupo-b"]);
const LEGACY_NAMES = new Set(["a", "b", "grupo a", "grupo b"]);

function required(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Falta la variable de entorno ${names.join(" o ")}.`);
}

function log(message) {
  console.log(`${APPLY ? "[apply]" : "[dry-run]"} ${message}`);
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function isLegacyGroup(group) {
  return LEGACY_SLUGS.has(normalize(group.slug)) || LEGACY_NAMES.has(normalize(group.name));
}

async function deleteRows(service, table, column, ids) {
  if (!ids.length) return 0;
  const { error, count } = await service
    .from(table)
    .delete({ count: "exact" })
    .in(column, ids);
  if (error) throw new Error(`No se pudo limpiar ${table}: ${error.message}`);
  return count ?? 0;
}

async function appendAudit(service, input) {
  const { error } = await service.rpc("append_audit_event", {
    p_event_type: input.eventType,
    p_actor_id: input.actorId ?? null,
    p_actor_email: input.actorEmail ?? null,
    p_group_id: input.groupId ?? null,
    p_target_type: input.targetType ?? null,
    p_target_id: input.targetId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) {
    console.warn(`[audit] No se pudo registrar ${input.eventType}: ${error.message}`);
  }
}

async function main() {
  const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const email = required("INGEST_EMAIL");
  const password = required("INGEST_PASSWORD");

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !authData.user) {
    throw new Error(`No fue posible iniciar sesión: ${authError?.message ?? "sin usuario"}`);
  }
  const currentUserId = authData.user.id;

  const { data: actor, error: actorError } = await userClient
    .from("profiles")
    .select("is_superadmin")
    .eq("id", currentUserId)
    .single();
  if (actorError || !actor?.is_superadmin) {
    throw new Error("La cuenta de ingesta debe ser superadministradora.");
  }

  const { data: groups, error: groupsError } = await service
    .from("groups")
    .select("id, name, slug, is_active")
    .order("name");
  if (groupsError) throw new Error(`No se pudieron leer los grupos: ${groupsError.message}`);

  const legacyGroups = (groups ?? []).filter(isLegacyGroup);
  const legacyIds = legacyGroups.map((group) => group.id);
  log(`Grupos A/B encontrados: ${legacyGroups.map((group) => `${group.name} (${group.slug})`).join(", ") || "ninguno"}.`);

  const memberRows = legacyIds.length
    ? await service.from("group_memberships").select("user_id, group_id").in("group_id", legacyIds)
    : { data: [], error: null };
  if (memberRows.error) throw new Error(`No se pudieron leer las membresías A/B: ${memberRows.error.message}`);

  const membershipUserIds = [...new Set((memberRows.data ?? []).map((row) => row.user_id))];
  const allMemberships = membershipUserIds.length
    ? await service.from("group_memberships").select("user_id, group_id").in("user_id", membershipUserIds)
    : { data: [], error: null };
  if (allMemberships.error) throw new Error(`No se pudieron leer las membresías de prueba: ${allMemberships.error.message}`);

  const profiles = membershipUserIds.length
    ? await service.from("profiles").select("id, email, full_name, is_superadmin").in("id", membershipUserIds)
    : { data: [], error: null };
  if (profiles.error) throw new Error(`No se pudieron leer las cuentas de prueba: ${profiles.error.message}`);

  const legacyIdSet = new Set(legacyIds);
  const membershipsByUser = new Map();
  for (const row of allMemberships.data ?? []) {
    const list = membershipsByUser.get(row.user_id) ?? [];
    list.push(row.group_id);
    membershipsByUser.set(row.user_id, list);
  }

  const testUsers = (profiles.data ?? []).filter((profile) => {
    if (profile.is_superadmin || profile.id === currentUserId) return false;
    const memberships = membershipsByUser.get(profile.id) ?? [];
    return memberships.length > 0 && memberships.every((groupId) => legacyIdSet.has(groupId));
  });
  const retainedUsers = (profiles.data ?? []).filter(
    (profile) => !testUsers.some((candidate) => candidate.id === profile.id),
  );

  log(`Cuentas de prueba exclusivas de A/B: ${testUsers.map((profile) => profile.email).join(", ") || "ninguna"}.`);
  if (retainedUsers.length) {
    log(`Cuentas A/B conservadas por tener otros grupos: ${retainedUsers.map((profile) => profile.email).join(", ")}.`);
  }

  for (const group of legacyGroups) {
    const { data: documents, error } = await service
      .from("documents")
      .select("id, title")
      .eq("group_id", group.id)
      .limit(5);
    if (error) throw new Error(`No se pudieron leer los documentos de ${group.name}: ${error.message}`);
    if (documents?.length) {
      throw new Error(
        `El grupo ${group.name} tiene documentos (${documents.map((document) => document.title).join(", ")}); abortando para revisar Storage y accesos.`,
      );
    }
  }

  const kpo = (groups ?? []).find((group) => normalize(group.slug) === "kpo");
  if (!kpo) throw new Error("No existe el grupo KPO (slug kpo).");

  const { data: kpoDocuments, error: kpoDocumentsError } = await service
    .from("documents")
    .select("id, title, status, visibility")
    .eq("group_id", kpo.id)
    .order("title");
  if (kpoDocumentsError) throw new Error(`No se pudieron leer los documentos KPO: ${kpoDocumentsError.message}`);

  log(`Documentos KPO: ${kpoDocuments?.length ?? 0}; se pasarán a restricted los que sigan en common.`);

  if (!APPLY) {
    log(`Se eliminarían ${legacyGroups.length} grupos y ${testUsers.length} cuentas de prueba.`);
    log(`Se actualizarían ${(kpoDocuments ?? []).filter((document) => document.visibility !== "restricted").length} documentos KPO.`);
    log("Dry-run completado. Ejecuta con --apply para aplicar los cambios.");
    return;
  }

  for (const group of legacyGroups) {
    await deleteRows(service, "invitation_redemptions", "group_id", [group.id]);
    await deleteRows(service, "invitations", "group_id", [group.id]);
    await deleteRows(service, "group_memberships", "group_id", [group.id]);
    await deleteRows(service, "groups", "id", [group.id]);
    await appendAudit(service, {
      eventType: "group_deleted",
      actorId: currentUserId,
      actorEmail: email,
      groupId: group.id,
      targetType: "group",
      targetId: group.id,
      metadata: { name: group.name, slug: group.slug },
    });
    log(`Grupo eliminado: ${group.name} (${group.slug}).`);
  }

  for (const profile of testUsers) {
    const { error } = await service.auth.admin.deleteUser(profile.id);
    if (error) {
      console.warn(`[users] No se pudo eliminar ${profile.email}: ${error.message}`);
      continue;
    }
    await appendAudit(service, {
      eventType: "profile_deleted",
      actorId: currentUserId,
      actorEmail: email,
      targetType: "profile",
      targetId: profile.id,
      metadata: { email: profile.email, source: "configure-groups" },
    });
    log(`Cuenta eliminada: ${profile.email}.`);
  }

  for (const document of kpoDocuments ?? []) {
    if (document.visibility === "restricted") continue;
    const { error } = await userClient.rpc("set_document_access", {
      p_document_id: document.id,
      p_visibility: "restricted",
      p_group_ids: [],
    });
    if (error) throw new Error(`No se pudo restringir ${document.title}: ${error.message}`);
    log(`Documento KPO restringido: ${document.title}.`);
  }

  const { count: kpoPublished } = await service
    .from("documents")
    .select("id", { head: true, count: "exact" })
    .eq("group_id", kpo.id)
    .eq("status", "published")
    .eq("visibility", "restricted");
  log(`Verificación: KPO=${kpoPublished ?? 0} publicados/restricted.`);
  if (kpoPublished !== 15) {
    console.warn(`[verify] Se esperaban 15 documentos KPO y hay ${kpoPublished ?? 0}.`);
  }
  log("Reconfiguración completada.");
}

main().catch((error) => {
  console.error(`\nError: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
