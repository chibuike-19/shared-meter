import Link from "next/link";
import { notFound } from "next/navigation";
import { requireResident } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getResidentTimeline, type TimelineEvent } from "@/lib/services/timeline";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const fmtNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);

const fmtKwh = (n: number) =>
  `${n.toLocaleString("en-NG", { maximumFractionDigits: 3 })}`;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

function Running({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`tabular-nums font-medium ${positive ? "text-green-600" : "text-red-600"}`}>
      {positive ? "+" : ""}
      {fmtKwh(value)} kWh
    </span>
  );
}

function EventRow({ event }: { event: TimelineEvent }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b p-3 last:border-0">
      <div className="min-w-0 space-y-0.5">
        {event.kind === "interval" && (
          <>
            <p className="text-sm">
              Used{" "}
              <span className="font-medium tabular-nums">{fmtKwh(event.usedKwh)} kWh</span>
              {event.fromReading != null && (
                <span className="text-muted-foreground">
                  {" "}
                  ({fmtKwh(event.fromReading)} → {fmtKwh(event.toReading)})
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(event.at)}</p>
          </>
        )}

        {event.kind === "recharge" && (
          <>
            <p className="text-sm">
              Recharged{" "}
              <span className="font-medium tabular-nums">{fmtNaira(event.amountNaira)}</span>{" "}
              <span className="text-muted-foreground">
                → {fmtKwh(event.kwhCredited)} kWh at {fmtNaira(event.priceApplied)}/kWh
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {fmtDateTime(event.at)}
              {!event.counted && " · not counted in balance"}
            </p>
          </>
        )}

        {event.kind === "adjustment" && (
          <>
            <p className="text-sm">
              Adjustment{" "}
              <span className="font-medium tabular-nums">
                {event.kwhDelta >= 0 ? "+" : ""}
                {fmtKwh(event.kwhDelta)} kWh
              </span>
              <span className="text-muted-foreground"> — {event.reason}</span>
            </p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(event.at)}</p>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {event.kind === "recharge" && (
          <Badge
            variant="outline"
            className={
              event.status === "approved"
                ? "border-green-500 text-green-700"
                : event.status === "pending"
                  ? "border-amber-500 text-amber-700"
                  : "text-muted-foreground"
            }
          >
            {event.status}
          </Badge>
        )}
        <Running value={event.runningBalanceKwh} />
      </div>
    </li>
  );
}

export default async function ResidentDetailPage({
  params,
}: {
  params: Promise<{ residentId: string }>;
}) {
  const { residentId } = await params;
  const me = await requireResident();
  const supabase = await createClient();
  const timeline = await getResidentTimeline(supabase, residentId);
  if (!timeline) notFound();

  const { resident, events, currentBalanceKwh } = timeline;

  return (
    <>
      <AppHeader resident={me} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              {resident.houseLabel}
              {resident.id === me.id && (
                <span className="ml-2 text-sm text-primary">(you)</span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{resident.fullName}</p>
          </div>
          <Link href="/group" className="text-sm text-muted-foreground hover:underline">
            ← Group
          </Link>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current balance</CardDescription>
            <CardTitle className="text-3xl">
              <Running value={currentBalanceKwh} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Opening reading {fmtKwh(resident.openingReading)} kWh
            {resident.openingBalanceKwh !== 0 &&
              ` · opening balance ${fmtKwh(resident.openingBalanceKwh)} kWh`}
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            History (newest first)
          </h2>
          {events.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No readings, recharges or adjustments yet.
              </CardContent>
            </Card>
          ) : (
            <ul className="rounded-lg border bg-white">
              {events.map((e) => (
                <EventRow key={`${e.kind}-${e.id}`} event={e} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
