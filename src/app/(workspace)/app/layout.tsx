import type { ReactNode } from "react";
import { connection } from "next/server";

import { WorkspaceShell } from "@/components/workspace-shell";
import { requireWorkspaceUser } from "@/lib/auth/workspace";
import { canAccessSimulator } from "@/lib/auth/simulator";
import { demoVariantForEmail } from "@/lib/auth/demo";

export const instant = false;

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await connection();
  const { profile, memberships } = await requireWorkspaceUser();
  const showAdmin =
    profile.is_superadmin ||
    memberships.some((membership) => membership.role === "group_admin");
  const showSimulator = canAccessSimulator(profile.is_superadmin, memberships);
  const demoVariant = demoVariantForEmail(profile.email);

  return (
    <WorkspaceShell
      showAdmin={showAdmin}
      showSimulator={showSimulator}
      showHistory={!demoVariant}
      demoVariant={demoVariant}
    >
      {children}
    </WorkspaceShell>
  );
}
