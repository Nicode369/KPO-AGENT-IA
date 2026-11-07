import type { ReactNode } from "react";
import { connection } from "next/server";

import { AdminNav } from "@/components/admin-nav";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAdminUser } from "@/lib/auth/workspace";

export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();
  const { isSuperadmin } = await requireAdminUser();

  return (
    <WorkspaceShell showAdmin>
      <div className="admin-shell">
        <AdminNav isSuperadmin={isSuperadmin} />
        {children}
      </div>
    </WorkspaceShell>
  );
}
