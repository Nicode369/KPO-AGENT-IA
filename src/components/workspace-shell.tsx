import type { ReactNode } from "react";
import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { LibraryIcon, ShieldIcon } from "@/components/icons";

export function WorkspaceShell({
  children,
  showAdmin = false,
  section = "workspace",
}: {
  children: ReactNode;
  showAdmin?: boolean;
  section?: "workspace" | "admin";
}) {
  return (
    <div className="signed-in-shell">
      <header className="signed-in-header">
        <div className="signed-in-header-inner">
          <Link className="signed-in-brand" href="/app" aria-label="KPO Agent AI, espacio">
            <BrandMark />
            <span className="signed-in-brand-text">KPO <i>/</i> AGENT</span>
          </Link>
          <nav className="signed-in-nav" aria-label="Navegación principal">
            <Link
              className={section === "workspace" ? "active" : undefined}
              href="/app"
              aria-current={section === "workspace" ? "page" : undefined}
            >
              <LibraryIcon size={16} />
              Espacio
            </Link>
            {showAdmin ? (
              <Link
                className={section === "admin" ? "active" : undefined}
                href="/admin"
                aria-current={section === "admin" ? "page" : undefined}
              >
                <ShieldIcon size={16} />
                Administración
              </Link>
            ) : null}
          </nav>
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
