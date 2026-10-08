import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuditLog } from "@/lib/services/admin-queries";
import { AppHeader } from "@/components/app-header";
import { AdminNav } from "@/components/admin-nav";
import { AuditTable } from "./audit-table";

export const dynamic = "force-dynamic";

const FILTERS = [
  { label: "All", entity: "" },
  { label: "Recharges", entity: "recharges" },
  { label: "Readings", entity: "readings" },
  { label: "Prices", entity: "price_history" },
  { label: "Adjustments", entity: "adjustments" },
  { label: "Residents", entity: "residents" },
  { label: "Settings", entity: "settings" },
] as const;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const admin = await requireAdmin();
  const { entity } = await searchParams;
  const db = createAdminClient();
  const entries = await getAuditLog(db, { entity: entity || undefined });

  return (
    <>
      <AppHeader resident={admin} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <AdminNav active="/admin/audit" />
        <h1 className="text-xl font-semibold">Audit log</h1>

        <div className="flex flex-wrap gap-1 text-sm">
          {FILTERS.map((f) => {
            const active = (entity ?? "") === f.entity;
            return (
              <Link
                key={f.label}
                href={f.entity ? `/admin/audit?entity=${f.entity}` : "/admin/audit"}
                className={`rounded-full px-3 py-1 ${
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: click a reading or recharge row to see its full detail and proof.
        </p>
        <AuditTable entries={entries} />
      </main>
    </>
  );
}
