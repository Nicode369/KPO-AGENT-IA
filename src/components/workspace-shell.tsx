import type { ReactNode } from "react";
import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { WorkspaceNav } from "@/components/workspace-nav";

export function WorkspaceShell({
  children,
  showAdmin = false,
}: {
  children: ReactNode;
  showAdmin?: boolean;
}) {
  return (
    <div className="signed-in-shell">
      <header className="signed-in-header">
        <div className="signed-in-header-inner">
          <Link className="signed-in-brand" href="/app" aria-label="KPO Agent AI, espacio">
            <BrandMark />
            <span className="signed-in-brand-text">KPO <i>/</i> AGENT</span>
          </Link>
          <WorkspaceNav showAdmin={showAdmin} />
          <div className="signed-in-actions">
            <span className="session-label">Sesión individual</span>
            <form action={signOut}><button className="link-button" type="submit">Cerrar sesión</button></form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
