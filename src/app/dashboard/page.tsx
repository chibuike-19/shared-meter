import Link from "next/link";
import { requireResident } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/services/balances";
import { getLatestApprovedRechargeAt } from "@/lib/services/recharges";
import { countRejectedSubmissions } from "@/lib/services/submissions";
import { AppHeader } from "@/components/app-header";
import { SubmitReadingDialog } from "./submit-reading-dialog";
import { LogRechargeDialog } from "./log-recharge-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const fmtKwh = (n: number) =>
  `${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 3 })} kWh`;

const fmtNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);

export default async function DashboardPage() {
  const resident = await requireResident();
  const supabase = await createClient();

  const [balance, latestRechargeAt, rejectedCount] = await Promise.all([
    getBalance(supabase, resident.id),
    getLatestApprovedRechargeAt(supabase),
    countRejectedSubmissions(supabase, resident.id),
  ]);

  const bal = balance?.balanceKwh ?? Number(resident.opening_balance_kwh);
  const positive = bal >= 0;

  // Prompt to submit a reading when a recharge happened after my last reading.
  const needsReading =
    latestRechargeAt != null &&
    (balance?.lastReadingAt == null ||
      new Date(latestRechargeAt) > new Date(balance.lastReadingAt));

  return (
    <>
      <AppHeader resident={resident} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
        <div>
          <h1 className="text-xl font-semibold">
            Hi {resident.full_name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            {resident.house_label}
            {resident.role === "admin" && " · Admin"}
          </p>
        </div>

        {rejectedCount > 0 && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {rejectedCount === 1
              ? "One of your submissions was rejected. "
              : `${rejectedCount} of your submissions were rejected. `}
            <Link href="/history" className="font-medium underline">
              See why in your history
            </Link>
            .
          </div>
        )}

        {needsReading && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            A recharge happened on{" "}
            <strong>
              {new Date(latestRechargeAt!).toLocaleDateString("en-NG")}
            </strong>
            . Please submit your latest reading so balances stay accurate.
          </div>
        )}

        <Card>
          <CardHeader>
            <CardDescription>
              {positive ? "You're in credit" : "You owe the group"}
            </CardDescription>
            <CardTitle
              className={`text-4xl tabular-nums ${
                positive ? "text-green-600" : "text-red-600"
              }`}
            >
              {positive ? "+" : ""}
              {fmtKwh(bal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {balance?.nairaEquivalent != null && (
              <p className="text-base text-foreground">
                ≈ {fmtNaira(balance.nairaEquivalent)}
                {balance.pricePerKwh != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    at {fmtNaira(balance.pricePerKwh)}/kWh
                  </span>
                )}
              </p>
            )}
            <p>
              {balance?.lastReadingAt
                ? `As of ${new Date(balance.lastReadingAt).toLocaleString("en-NG")}`
                : "No readings yet — balance reflects your opening values."}
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid for</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl tabular-nums">
              {fmtKwh(balance?.paidForKwh ?? 0)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Consumed</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl tabular-nums">
              {fmtKwh(balance?.consumedKwh ?? 0)}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SubmitReadingDialog
            latestReading={balance?.latestReading ?? Number(resident.opening_reading)}
            lastReadingAt={balance?.lastReadingAt ?? null}
          />
          <LogRechargeDialog />
        </div>

        <div className="text-center">
          <Button asChild variant="link" size="sm">
            <Link href="/group">View group breakdown →</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
