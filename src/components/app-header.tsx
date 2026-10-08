import Link from "next/link";
import type { ResidentRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { MobileNav, type NavLink } from "@/components/mobile-nav";

/** Top navigation shared across signed-in pages. Inline links on desktop,
 * hamburger menu on mobile. */
export function AppHeader({ resident }: { resident: ResidentRow }) {
  const isAdmin = resident.role === "admin";

  const links: NavLink[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/group", label: "Group" },
    { href: "/history", label: "History" },
    { href: "/activity", label: "Activity" },
    ...(isAdmin ? [{ href: "/admin/approvals", label: "Admin" }] : []),
  ];

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="font-semibold">
          ⚡ Shared Meter
        </Link>

        {/* Desktop: inline links */}
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {links.map((l) => (
            <Button key={l.href} asChild variant="ghost" size="sm">
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </nav>

        {/* Mobile: hamburger menu */}
        <MobileNav links={links} />
      </div>
    </header>
  );
}
