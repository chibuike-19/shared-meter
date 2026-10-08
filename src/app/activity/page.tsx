import { requireResident } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActivityFeed, type ActivityEvent } from "@/lib/services/activity";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const fmtNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);

function when(iso: string) {
  return new Date(iso).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ event }: { event: ActivityEvent }) {
  if (event.kind === "reading") {
    if (event.status === "accepted")
      return <Badge variant="outline" className="border-green-500 text-green-700">accepted</Badge>;
    if (event.status === "flagged")
      return <Badge variant="outline" className="border-amber-500 text-amber-700">flagged</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">rejected</Badge>;
  }
  if (event.status === "approved")
    return <Badge variant="outline" className="border-green-500 text-green-700">approved</Badge>;
  if (event.status === "pending")
    return <Badge variant="outline" className="border-amber-500 text-amber-700">pending</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">rejected</Badge>;
}

export default async function ActivityPage() {
  const resident = await requireResident();
  const supabase = await createClient();
  const events = await getActivityFeed(supabase);

  return (
    <>
      <AppHeader resident={resident} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Activity</h1>
          <p className="text-sm text-muted-foreground">
            Recent readings and recharges across the group.
          </p>
        </div>

        {events.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No activity yet.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li
                key={`${e.kind}-${e.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    <span className="font-medium">{e.houseLabel}</span>{" "}
                    <span className="text-muted-foreground">
                      {e.fullName === "Unknown" ? "" : `· ${e.fullName}`}
                    </span>
                  </p>
                  <p className="text-sm">
                    {e.kind === "reading" ? (
                      <>
                        submitted a reading of{" "}
                        <span className="tabular-nums">{e.readingKwh} kWh</span>
                      </>
                    ) : (
                      <>
                        recharged{" "}
                        <span className="tabular-nums">{fmtNaira(e.amountNaira)}</span>{" "}
                        <span className="text-muted-foreground tabular-nums">
                          ({e.kwhCredited} kWh)
                        </span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{when(e.occurredAt)}</p>
                  {e.status === "rejected" && e.reason && (
                    <p className="mt-1 text-xs text-red-700">Rejected: {e.reason}</p>
                  )}
                </div>
                <StatusBadge event={e} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
