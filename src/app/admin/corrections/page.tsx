import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listResidents } from "@/lib/services/residents";
import { getRecentReadings } from "@/lib/services/admin-queries";
import { AppHeader } from "@/components/app-header";
import { AdminNav } from "@/components/admin-nav";
import { AddAdjustmentForm, RejectReadingButton } from "./corrections-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default async function CorrectionsPage() {
  const admin = await requireAdmin();
  const db = createAdminClient();
  const [residents, readings] = await Promise.all([
    listResidents(db),
    getRecentReadings(db),
  ]);
  const activeResidents = residents
    .filter((r) => r.is_active)
    .map((r) => ({ id: r.id, houseLabel: r.house_label, fullName: r.full_name }));

  return (
    <>
      <AppHeader resident={admin} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
        <AdminNav active="/admin/corrections" />
        <h1 className="text-xl font-semibold">Corrections</h1>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Add an adjustment</CardDescription>
          </CardHeader>
          <CardContent>
            <AddAdjustmentForm residents={activeResidents} />
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent readings</h2>
          <div className="rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>House</TableHead>
                  <TableHead className="text-right">Reading</TableHead>
                  <TableHead>Taken</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No readings yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  readings.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.houseLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.readingKwh}</TableCell>
                      <TableCell className="text-sm">{fmtDateTime(r.takenAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.status === "accepted"
                              ? "border-green-500 text-green-700"
                              : r.status === "flagged"
                                ? "border-amber-500 text-amber-700"
                                : "text-muted-foreground"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status !== "rejected" && <RejectReadingButton id={r.id} />}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </>
  );
}
