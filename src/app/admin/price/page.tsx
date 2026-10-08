import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPrice, getPriceHistory } from "@/lib/services/pricing";
import { AppHeader } from "@/components/app-header";
import { AdminNav } from "@/components/admin-nav";
import { AddPriceForm } from "./price-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const fmtNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default async function PricePage() {
  const admin = await requireAdmin();
  const db = createAdminClient();
  const [current, history] = await Promise.all([getCurrentPrice(db), getPriceHistory(db)]);

  return (
    <>
      <AppHeader resident={admin} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
        <AdminNav active="/admin/price" />
        <h1 className="text-xl font-semibold">Price</h1>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current price</CardDescription>
            <CardTitle className="text-3xl">
              {current == null ? "Not set" : `${fmtNaira(current)}/kWh`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Changing the price only affects future recharges. Past recharges keep the
            price locked at their own recharge time.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Add a new price</CardDescription>
          </CardHeader>
          <CardContent>
            <AddPriceForm />
          </CardContent>
        </Card>

        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Price / kWh</TableHead>
                <TableHead>Effective from</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No prices yet.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="tabular-nums">
                      {fmtNaira(Number(p.price_per_kwh))}
                    </TableCell>
                    <TableCell>
                      {fmtDateTime(p.effective_from)}
                      {p.isScheduled && (
                        <span className="ml-2 text-xs text-muted-foreground">(scheduled)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.isCurrent && (
                        <Badge variant="outline" className="border-green-500 text-green-700">
                          current
                        </Badge>
                      )}
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
