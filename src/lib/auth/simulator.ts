import { redirect } from "next/navigation";

import { recordAuditEvent } from "@/lib/audit/log";
import {
  requireWorkspaceUser,
  type AppRole,
  type WorkspaceMembership,
} from "@/lib/auth/workspace";

export const SIMULATOR_ROLES: AppRole[] = ["group_admin", "supervisor"];

export function canAccessSimulator(
  isSuperadmin: boolean,
  memberships: Pick<WorkspaceMembership, "role">[],
): boolean {
  return (
    isSuperadmin ||
    memberships.some((membership) => SIMULATOR_ROLES.includes(membership.role))
  );
}

export function canManageSimulatorCases(
  isSuperadmin: boolean,
  memberships: Pick<WorkspaceMembership, "role">[],
): boolean {
  return (
    isSuperadmin ||
    memberships.some((membership) => membership.role === "group_admin")
  );
}

export function simulatorGroupIds(
  memberships: WorkspaceMembership[],
  manageOnly = false,
): string[] {
  return memberships
    .filter((membership) =>
      manageOnly
        ? membership.role === "group_admin"
        : SIMULATOR_ROLES.includes(membership.role),
    )
    .map((membership) => membership.group_id);
}

export async function requireSimulatorUser() {
  const context = await requireWorkspaceUser();
  if (!canAccessSimulator(context.profile.is_superadmin, context.memberships)) {
    await recordAuditEvent({
      eventType: "authorization_denied",
      actorId: context.userId,
      actorEmail: context.profile.email,
      targetType: "area",
      targetId: "simulator",
      metadata: { role: "not_allowed" },
    });
    redirect("/app");
  }

  return {
    ...context,
    isSuperadmin: context.profile.is_superadmin,
    simulatorGroupIds: simulatorGroupIds(context.memberships),
    manageGroupIds: simulatorGroupIds(context.memberships, true),
    canManage: canManageSimulatorCases(
      context.profile.is_superadmin,
      context.memberships,
    ),
  };
}
