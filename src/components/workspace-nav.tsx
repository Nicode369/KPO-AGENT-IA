"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HistoryIcon, LibraryIcon, ShieldIcon } from "@/components/icons";

export function WorkspaceNav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  const isWorkspace = pathname === "/app";
  const isHistory = pathname.startsWith("/app/history");
  const isAdmin = pathname.startsWith("/admin");

  return (
    <nav className="signed-in-nav" aria-label="Navegación principal">
      <Link
        className={isWorkspace ? "active" : undefined}
        href="/app"
        aria-current={isWorkspace ? "page" : undefined}
      >
        <LibraryIcon size={16} />
        Espacio
      </Link>
      <Link
        className={isHistory ? "active" : undefined}
        href="/app/history"
        aria-current={isHistory ? "page" : undefined}
      >
        <HistoryIcon size={16} />
        Historial
      </Link>
      {showAdmin ? (
        <Link
          className={isAdmin ? "active" : undefined}
          href="/admin"
          aria-current={isAdmin ? "page" : undefined}
        >
          <ShieldIcon size={16} />
          Administración
        </Link>
      ) : null}
    </nav>
  );
}
