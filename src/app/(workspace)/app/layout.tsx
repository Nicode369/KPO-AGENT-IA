import type { ReactNode } from "react";
import { connection } from "next/server";

import { WorkspaceShell } from "@/components/workspace-shell";
import { requireWorkspaceUser } from "@/lib/auth/workspace";

export const instant = false;

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await connection();
  const { profile, memberships } = await requireWorkspaceUser();
  const showAdmin =
    profile.is_superadmin ||
    memberships.some((membership) => membership.role === "group_admin");

  return (
    <WorkspaceShell showAdmin={showAdmin}>
      {children}
    </WorkspaceShell>
  );
}
