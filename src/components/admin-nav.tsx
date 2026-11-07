"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DashboardIcon, GroupsIcon, InvitationIcon, UsersIcon } from "@/components/icons";

const items = [
  { href: "/admin", label: "Resumen", icon: DashboardIcon, exact: true },
  { href: "/admin/groups", label: "Grupos", icon: GroupsIcon, exact: false },
  { href: "/admin/invitations", label: "Invitaciones", icon: InvitationIcon, exact: false },
  { href: "/admin/users", label: "Usuarios", icon: UsersIcon, exact: false },
];

export function AdminNav({ isSuperadmin }: { isSuperadmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Administración">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
      {isSuperadmin ? <span className="admin-badge">Superadmin</span> : null}
    </nav>
  );
}
