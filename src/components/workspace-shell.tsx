import type { ReactNode } from "react";
import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { WorkspaceNav } from "@/components/workspace-nav";
import type { DemoVariant } from "@/lib/auth/demo";
import { demoCopy } from "@/lib/demo/variants";

export function WorkspaceShell({
  children,
  showAdmin = false,
  showSimulator = false,
  showHistory = true,
  demoVariant = null,
}: {
  children: ReactNode;
  showAdmin?: boolean;
  showSimulator?: boolean;
  showHistory?: boolean;
  demoVariant?: DemoVariant | null;
}) {
  const demo = demoCopy(demoVariant);

  return (
    <div className="signed-in-shell">
      <header className="signed-in-header">
        <div className="signed-in-header-inner">
          <Link className="signed-in-brand" href="/app" aria-label="RAG Agent AI, espacio">
            <BrandMark />
            <span className="signed-in-brand-text">RAG <i>/</i> AGENT</span>
          </Link>
          <WorkspaceNav
            showAdmin={showAdmin}
            showSimulator={showSimulator}
            showHistory={showHistory}
          />
          <div className="signed-in-actions">
            <span className="session-label">
              {demo ? demo.label : "Sesión individual"}
            </span>
            <form action={signOut}><button className="link-button" type="submit">Cerrar sesión</button></form>
          </div>
        </div>
      </header>
      {demo ? (
        <div className="demo-banner" role="status">
          <div className="demo-banner-inner">
            <span className="demo-badge">{demo.label}</span>
            <p>
              Estás explorando {demo.library} con una cuenta compartida. El historial
              y la administración no están disponibles.
            </p>
            {demoVariant === "clima" ? (
              <Link href="/caso-de-estudio">Ver caso de estudio</Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
