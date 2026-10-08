import Link from "next/link";

const TABS = [
  { href: "/admin/approvals", label: "Approvals" },
  { href: "/admin/residents", label: "Residents" },
  { href: "/admin/price", label: "Price" },
  { href: "/admin/corrections", label: "Corrections" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
] as const;

/** Sub-navigation shown across the admin area. `active` is the current href. */
export function AdminNav({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2 text-sm">
      {TABS.map((t) => {
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-md px-3 py-1.5 ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
