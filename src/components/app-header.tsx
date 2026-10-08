import Link from "next/link";
import type { ResidentRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";

/** Top navigation shared across signed-in pages. */
export function AppHeader({ resident }: { resident: ResidentRow }) {
  const isAdmin = resident.role === "admin";
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="font-semibold">
          ⚡ Shared Meter
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/group">Group</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/history">History</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/activity">Activity</Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/approvals">Admin</Link>
            </Button>
          )}
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
