"use server";

import { revalidatePath } from "next/cache";

import {
  type AppRole,
  type MembershipStatus,
  requireAdminUser,
} from "@/lib/auth/workspace";

export type AdminActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  invitationCode?: string;
  invitationExpiresAt?: string;
};

const roles: AppRole[] = ["group_admin", "supervisor", "analyst"];
const statuses: MembershipStatus[] = ["pending", "active", "disabled"];

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function errorState(message: string): AdminActionState {
  return { status: "error", message };
}

export async function createGroupAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { supabase, isSuperadmin } = await requireAdminUser();
  if (!isSuperadmin) return errorState("Solo el superadministrador puede crear grupos.");

  const name = field(formData, "name");
  const slug = field(formData, "slug").toLowerCase();

  if (name.length < 2 || name.length > 120) {
    return errorState("El nombre debe tener entre 2 y 120 caracteres.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    return errorState("El identificador debe usar minúsculas, números y guiones.");
  }

  const { error } = await supabase.rpc("create_group", { p_name: name, p_slug: slug });
  if (error) {
    if (error.code === "23505") return errorState("Ese identificador ya está en uso.");
    return errorState("No se pudo crear el grupo.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/groups");
  return { status: "success", message: "Grupo creado." };
}

export async function createInvitationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { supabase, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const groupId = field(formData, "group_id");
  const role = field(formData, "role") as AppRole;
  const maxUses = Number.parseInt(field(formData, "max_uses"), 10);
  const expires = field(formData, "expires_at");

  if (!groupId) return errorState("Selecciona un grupo.");
  if (!isSuperadmin && !adminGroupIds.includes(groupId)) {
    return errorState("No puedes crear invitaciones para ese grupo.");
  }
  if (!roles.includes(role)) return errorState("Rol inválido.");
  if (role === "group_admin" && !isSuperadmin) {
    return errorState("Solo el superadministrador puede invitar administradores de grupo.");
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 500) {
    return errorState("Los usos deben ser un número entre 1 y 500.");
  }

  let expiresAt = new Date(`${expires}T23:59:59.999Z`);
  const now = new Date();
  const maxExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    return errorState("La fecha de expiración debe ser futura.");
  }
  if (expiresAt > maxExpiry) {
    if (expiresAt.getTime() - maxExpiry.getTime() > 24 * 60 * 60 * 1000) {
      return errorState("La fecha de expiración no puede superar 365 días.");
    }
    expiresAt = maxExpiry;
  }

  const legacyMaxExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  let { data, error } = await supabase.rpc("create_invitation", {
    p_group_id: groupId,
    p_role: role,
    p_max_uses: maxUses,
    p_expires_at: expiresAt.toISOString(),
  });

  let adjustedExpiry = false;
  if (error?.code === "22023" && expiresAt > legacyMaxExpiry) {
    expiresAt = legacyMaxExpiry;
    adjustedExpiry = true;
    ({ data, error } = await supabase.rpc("create_invitation", {
      p_group_id: groupId,
      p_role: role,
      p_max_uses: maxUses,
      p_expires_at: expiresAt.toISOString(),
    }));
  }

  if (error) {
    if (error.code === "42501") return errorState("No autorizado para ese grupo.");
    if (error.code === "22023") return errorState("Límites de invitación inválidos.");
    return errorState("No se pudo crear la invitación.");
  }

  const invitation = Array.isArray(data) ? data[0] : null;
  if (!invitation?.invitation_code) return errorState("La invitación se creó sin código.");

  const invitationCode = invitation.invitation_code.toUpperCase();
  const usesShortCode = invitationCode.length === 6;

  revalidatePath("/admin");
  revalidatePath("/admin/invitations");
  return {
    status: "success",
    message: usesShortCode && !adjustedExpiry
      ? "Invitación creada con un código de 6 caracteres en mayúsculas. Copia el código ahora; no se volverá a mostrar."
      : adjustedExpiry
        ? "Invitación creada con 90 días de vigencia; aplica la migración 202611080001 para habilitar códigos de 6 caracteres en mayúsculas y 365 días."
        : "Invitación creada con un código de 48 caracteres en mayúsculas. Aplica la migración 202611080001 para habilitar códigos de 6 caracteres.",
    invitationCode,
    invitationExpiresAt: invitation.expires_at,
  };
}

export async function revokeInvitationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { supabase } = await requireAdminUser();
  const invitationId = field(formData, "invitation_id");
  if (!invitationId) return errorState("Invitación inválida.");

  const { error } = await supabase.rpc("revoke_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) {
    if (error.code === "42501") return errorState("No autorizado para esa invitación.");
    return errorState("No se pudo revocar la invitación.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invitations");
  return { status: "success", message: "Invitación revocada." };
}

export async function updateMembershipAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { supabase, isSuperadmin, adminGroupIds } = await requireAdminUser();
  const membershipId = field(formData, "membership_id");
  const role = field(formData, "role") as AppRole;
  const status = field(formData, "status") as MembershipStatus;

  if (!membershipId) return errorState("Membresía inválida.");
  if (!roles.includes(role)) return errorState("Rol inválido.");
  if (!statuses.includes(status)) return errorState("Estado inválido.");
  if (role === "group_admin" && !isSuperadmin) {
    return errorState("Solo el superadministrador puede asignar administradores de grupo.");
  }

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("id", membershipId)
    .maybeSingle<{ group_id: string }>();

  if (!membership || (!isSuperadmin && !adminGroupIds.includes(membership.group_id))) {
    return errorState("No autorizado para esa membresía.");
  }

  const { error } = await supabase.rpc("update_group_membership", {
    p_membership_id: membershipId,
    p_role: role,
    p_status: status,
  });
  if (error) {
    if (error.code === "42501") return errorState("No autorizado para ese cambio.");
    if (error.code === "23514") return errorState("El usuario debe verificar su correo antes de activarse.");
    return errorState("No se pudo actualizar la membresía.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { status: "success", message: "Membresía actualizada." };
}

export async function setProfileActiveAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { supabase, isSuperadmin } = await requireAdminUser();
  if (!isSuperadmin) return errorState("Solo el superadministrador puede cambiar cuentas.");

  const userId = field(formData, "user_id");
  const isActive = field(formData, "is_active") === "true";
  if (!userId) return errorState("Usuario inválido.");

  const { error } = await supabase.rpc("set_profile_active", {
    p_user_id: userId,
    p_is_active: isActive,
  });
  if (error) {
    if (error.code === "42501") return errorState("No autorizado para esa cuenta.");
    if (error.code === "23514") return errorState("Debe quedar al menos un superadministrador activo.");
    return errorState("No se pudo actualizar la cuenta.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { status: "success", message: "Cuenta actualizada." };
}

export async function revokeUserSessionsAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { supabase, isSuperadmin, userId: currentUserId } = await requireAdminUser();
  if (!isSuperadmin) return errorState("Solo el superadministrador puede revocar sesiones.");

  const userId = field(formData, "user_id");
  if (!userId) return errorState("Usuario inválido.");
  if (userId === currentUserId) {
    return errorState("No puedes revocar tu propia sesión desde aquí.");
  }

  const { error } = await supabase.rpc("revoke_user_sessions", { p_user_id: userId });
  if (error) {
    if (error.code === "42501") return errorState("No autorizado para esa cuenta.");
    if (error.code === "P0002") return errorState("El usuario no existe.");
    return errorState("No se pudieron revocar las sesiones.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return {
    status: "success",
    message: "Sesiones revocadas. El usuario deberá iniciar sesión de nuevo.",
  };
}
