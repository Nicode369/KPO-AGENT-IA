import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { DocumentRecord } from "./documents";
import type { Env } from "./env";
import { HttpError } from "./http";
import { createAdminClient, createAnonClient } from "./supabase";

export interface Profile {
  id: string;
  is_active: boolean;
  is_superadmin: boolean;
}

export interface AuthContext {
  user: User;
  profile: Profile;
  admin: SupabaseClient;
}

export interface GroupContext extends AuthContext {
  group: {
    id: string;
    name: string;
    is_active: boolean;
  };
}

export interface DocumentContext extends GroupContext {
  document: DocumentRecord;
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(
      401,
      "missing_token",
      "Falta el token de acceso de Supabase."
    );
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new HttpError(
      401,
      "missing_token",
      "Falta el token de acceso de Supabase."
    );
  }

  return token;
}

export async function authenticate(
  request: Request,
  env: Env
): Promise<AuthContext> {
  const token = bearerToken(request);
  const anon = createAnonClient(env);
  const { data, error } = await anon.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError(
      401,
      "invalid_token",
      "La sesión no es válida o ha expirado."
    );
  }

  const admin = createAdminClient(env);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, is_active, is_superadmin")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    throw new HttpError(
      503,
      "profile_lookup_failed",
      "No fue posible validar el perfil del usuario."
    );
  }

  if (!profile || !profile.is_active) {
    throw new HttpError(403, "account_inactive", "La cuenta no está activa.");
  }

  return {
    user: data.user,
    profile: profile as Profile,
    admin,
  };
}

export async function requireGroupAdmin(
  context: AuthContext,
  groupId: string
): Promise<GroupContext> {
  if (!isUuid(groupId)) {
    throw new HttpError(400, "invalid_group_id", "El grupo no es válido.");
  }

  const { data: group, error: groupError } = await context.admin
    .from("groups")
    .select("id, name, is_active")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    throw new HttpError(
      503,
      "group_lookup_failed",
      "No fue posible validar el grupo."
    );
  }

  if (!group || !group.is_active) {
    throw new HttpError(
      404,
      "group_not_found",
      "El grupo no existe o está inactivo."
    );
  }

  if (context.profile.is_superadmin) {
    return { ...context, group };
  }

  const { data: membership, error: membershipError } = await context.admin
    .from("group_memberships")
    .select("role, status")
    .eq("group_id", groupId)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (membershipError) {
    throw new HttpError(
      503,
      "membership_lookup_failed",
      "No fue posible validar la membresía."
    );
  }

  if (
    !membership ||
    membership.status !== "active" ||
    membership.role !== "group_admin"
  ) {
    throw new HttpError(
      403,
      "group_admin_required",
      "Se requiere ser administrador del grupo."
    );
  }

  return { ...context, group };
}

export async function requireDocumentManager(
  context: AuthContext,
  documentId: string
): Promise<DocumentContext> {
  if (!isUuid(documentId)) {
    throw new HttpError(400, "invalid_document_id", "El documento no es válido.");
  }

  const { data: document, error } = await context.admin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    throw new HttpError(
      503,
      "document_lookup_failed",
      "No fue posible validar el documento."
    );
  }

  if (!document) {
    throw new HttpError(
      404,
      "document_not_found",
      "El documento no existe."
    );
  }

  const groupContext = await requireGroupAdmin(
    context,
    (document as DocumentRecord).group_id
  );

  return { ...groupContext, document: document as DocumentRecord };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
