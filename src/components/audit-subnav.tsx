import Link from "next/link";

type AuditSection = "queries" | "events" | "reports";

const items: { key: AuditSection; href: string; label: string }[] = [
  { key: "queries", href: "/admin/audit", label: "Consultas" },
  { key: "events", href: "/admin/audit/events", label: "Eventos" },
  { key: "reports", href: "/admin/reports", label: "Reportes" },
];

export function AuditSubnav({ active }: { active: AuditSection }) {
  return (
    <nav className="admin-subnav" aria-label="Auditoría y reportes">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={item.key === active ? "active" : undefined}
          aria-current={item.key === active ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
