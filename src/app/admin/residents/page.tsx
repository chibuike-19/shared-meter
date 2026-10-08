import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listResidents } from "@/lib/services/residents";
import { AppHeader } from "@/components/app-header";
import { AdminNav } from "@/components/admin-nav";
import { AddResidentDialog } from "./resident-form";
import { ActiveToggle } from "./active-toggle";
import { EditResidentDialog, ReplaceMeterDialog } from "./row-actions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ResidentsPage() {
  const admin = await requireAdmin();
  const db = createAdminClient();
  const residents = await listResidents(db);

  return (
    <>
      <AppHeader resident={admin} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
        <AdminNav active="/admin/residents" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Residents</h1>
            <p className="text-sm text-muted-foreground">
              {residents.length} total · invite people and set opening readings.
            </p>
          </div>
          <AddResidentDialog />
        </div>

        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>House</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Opening kWh</TableHead>
                <TableHead className="text-right">Opening bal.</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {residents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No residents yet. Add the first one above.
                  </TableCell>
                </TableRow>
              ) : (
                residents.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.house_label}</TableCell>
                    <TableCell>{r.full_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.opening_reading).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.opening_balance_kwh).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {r.role === "admin" ? (
                        <Badge>Admin</Badge>
                      ) : (
                        <Badge variant="secondary">Resident</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.is_active ? (
                        <Badge variant="outline" className="border-green-500 text-green-700">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <EditResidentDialog
                          resident={{
                            id: r.id,
                            full_name: r.full_name,
                            house_label: r.house_label,
                            phone_e164: r.phone_e164,
                            role: r.role,
                            meter_serial: r.meter_serial,
                            opening_reading: Number(r.opening_reading),
                            opening_balance_kwh: Number(r.opening_balance_kwh),
                          }}
                        />
                        <ReplaceMeterDialog
                          resident={{
                            id: r.id,
                            house_label: r.house_label,
                            opening_reading: Number(r.opening_reading),
                          }}
                        />
                        <ActiveToggle id={r.id} isActive={r.is_active} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </>
  );
}
