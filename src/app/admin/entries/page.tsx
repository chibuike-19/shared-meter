import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listResidents } from "@/lib/services/residents";
import { AppHeader } from "@/components/app-header";
import { AdminNav } from "@/components/admin-nav";
import { AdminEntryForm } from "./entry-form";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminEntriesPage() {
  const admin = await requireAdmin();
  const residents = await listResidents(createAdminClient());
  const active = residents
    .filter((r) => r.is_active)
    .map((r) => ({ id: r.id, houseLabel: r.house_label, fullName: r.full_name }));

  return (
    <>
      <AppHeader resident={admin} />
      <main className="mx-auto w-full max-w-md flex-1 space-y-6 p-4">
        <AdminNav active="/admin/entries" />
        <div>
          <h1 className="text-xl font-semibold">Add entry</h1>
          <p className="text-sm text-muted-foreground">
            Record a meter reading or a recharge for a resident.
          </p>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>On behalf of a resident</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminEntryForm residents={active} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
