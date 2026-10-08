import Link from "next/link";
import { requireResident } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGroupSummary } from "@/lib/services/balances";
import { isReadingStale } from "@/lib/services/calc";
import { AppHeader } from "@/components/app-header";
import { GroupChart } from "./group-chart";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const fmtNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);

const fmtKwh = (n: number) =>
  `${n.toLocaleString("en-NG", { maximumFractionDigits: 3 })}`;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "medium" }) : "—";

function BalanceCell({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`tabular-nums ${positive ? "text-green-600" : "text-red-600"}`}>
      {positive ? "+" : ""}
      {fmtKwh(value)}
    </span>
  );
}

export default async function GroupPage() {
  const me = await requireResident();
  const supabase = await createClient();
  const summary = await getGroupSummary(supabase);

  const chartData = summary.rows.map((r) => ({
    house: r.houseLabel,
    paidFor: r.paidForKwh,
    consumed: r.consumedKwh,
  }));

  const price = summary.pricePerKwh;

  return (
    <>
      <AppHeader resident={me} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
        <div>
          <h1 className="text-xl font-semibold">Group breakdown</h1>
          <p className="text-sm text-muted-foreground">
            Who&apos;s paid for electricity vs who&apos;s used it — all in kWh.
          </p>
        </div>

        {/* Next recharge suggestion */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Who should recharge next</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.nextRecharger ? (
              <div>
                <p className="text-lg font-semibold">
                  {summary.nextRecharger.houseLabel} · {summary.nextRecharger.fullName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Suggested{" "}
                  <span className="font-medium text-foreground">
                    {fmtNaira(summary.nextRecharger.suggestedNaira)}
                  </span>{" "}
                  (≈ {fmtKwh(summary.nextRecharger.suggestedKwh)} kWh
                  {price != null && ` at ${fmtNaira(price)}/kWh`})
                </p>
              </div>
            ) : (
              <p className="text-sm">
                {price == null
                  ? "No price set yet — ask an admin to set the price."
                  : "Everyone's in credit 🎉"}
              </p>
            )}

            {summary.ranking.length > 0 && (
              <ol className="space-y-1 border-t pt-3 text-sm">
                {summary.ranking.map((r, i) => (
                  <li key={r.residentId} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {i + 1}. {r.houseLabel}
                    </span>
                    <span className="flex gap-3">
                      <BalanceCell value={r.balanceKwh} />
                      {r.suggestedNaira > 0 && (
                        <span className="w-20 text-right tabular-nums text-muted-foreground">
                          {fmtNaira(r.suggestedNaira)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Group pool */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Group pool</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {fmtKwh(summary.groupPoolKwh)} kWh
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sum of everyone&apos;s balance. It should roughly equal the units left on
            the shared meter.
          </CardContent>
        </Card>

        {/* Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid for vs consumed (kWh)</CardDescription>
            </CardHeader>
            <CardContent>
              <GroupChart data={chartData} />
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>House</TableHead>
                <TableHead className="text-right">Paid for</TableHead>
                <TableHead className="text-right">Consumed</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Last reading</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No active residents yet.
                  </TableCell>
                </TableRow>
              ) : (
                summary.rows.map((r) => {
                  const mine = r.residentId === me.id;
                  const stale = isReadingStale(r.lastReadingAt, summary.staleDays);
                  return (
                    <TableRow key={r.residentId} className={mine ? "bg-primary/5" : undefined}>
                      <TableCell>
                        <Link
                          href={`/group/${r.residentId}`}
                          className="font-medium hover:underline"
                        >
                          {r.houseLabel}
                        </Link>
                        {mine && <span className="ml-1 text-xs text-primary">(you)</span>}
                        <div className="text-xs text-muted-foreground">{r.fullName}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtKwh(r.paidForKwh)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtKwh(r.consumedKwh)}
                      </TableCell>
                      <TableCell className="text-right">
                        <BalanceCell value={r.balanceKwh} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">{fmtDate(r.lastReadingAt)}</span>
                          {stale ? (
                            <Badge variant="outline" className="w-fit border-amber-500 text-amber-700">
                              Stale
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="w-fit border-green-500 text-green-700">
                              Up to date
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            {summary.rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtKwh(summary.totals.paidForKwh)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtKwh(summary.totals.consumedKwh)}
                  </TableCell>
                  <TableCell className="text-right">
                    <BalanceCell value={summary.totals.balanceKwh} />
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        {/* Pending recharges */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending recharges</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">None awaiting approval.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {summary.pending.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{p.houseLabel}</span> ·{" "}
                      {fmtNaira(p.amountNaira)}{" "}
                      <span className="text-muted-foreground">
                        ({fmtKwh(p.kwhCredited)} kWh · {fmtDate(p.rechargedAt)})
                      </span>
                    </span>
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      pending approval
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
