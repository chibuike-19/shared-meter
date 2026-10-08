import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApprovalsQueue } from "@/lib/services/admin-queries";
import { signedProofUrl } from "@/lib/services/storage";
import { AppHeader } from "@/components/app-header";
import { AdminNav } from "@/components/admin-nav";
import { QueueActions } from "./queue-actions";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const fmtNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default async function ApprovalsPage() {
  const admin = await requireAdmin();
  const db = createAdminClient();
  const queue = await getApprovalsQueue(db);

  // Signed URLs for the private proof photos.
  const [rechargeUrls, readingUrls] = await Promise.all([
    Promise.all(queue.recharges.map((r) => (r.receiptPath ? signedProofUrl(db, r.receiptPath) : null))),
    Promise.all(queue.flaggedReadings.map((r) => (r.photoPath ? signedProofUrl(db, r.photoPath) : null))),
  ]);

  const nothing = queue.recharges.length === 0 && queue.flaggedReadings.length === 0;

  return (
    <>
      <AppHeader resident={admin} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
        <AdminNav active="/admin/approvals" />
        <h1 className="text-xl font-semibold">Approvals</h1>

        {nothing && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nothing awaiting approval. 🎉
            </CardContent>
          </Card>
        )}

        {queue.recharges.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Pending recharges ({queue.recharges.length})
            </h2>
            {queue.recharges.map((r, i) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <CardDescription>{fmtDateTime(r.rechargedAt)}</CardDescription>
                  <p className="font-medium">
                    {r.houseLabel} · {r.fullName}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    {fmtNaira(r.amountNaira)} →{" "}
                    <span className="font-medium">{r.kwhCredited} kWh</span>{" "}
                    <span className="text-muted-foreground">at {fmtNaira(r.pricePerKwh)}/kWh</span>
                  </p>
                  {r.note && <p className="text-sm text-muted-foreground">“{r.note}”</p>}
                  {rechargeUrls[i] ? (
                    <a
                      href={rechargeUrls[i]!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={rechargeUrls[i]!}
                        alt="Receipt"
                        className="h-32 w-auto rounded-md border object-cover"
                      />
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">No receipt photo.</p>
                  )}
                  <QueueActions id={r.id} kind="recharge" />
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {queue.flaggedReadings.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Flagged readings ({queue.flaggedReadings.length})
            </h2>
            {queue.flaggedReadings.map((r, i) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <CardDescription>{fmtDateTime(r.takenAt)}</CardDescription>
                  <p className="font-medium">
                    {r.houseLabel} · {r.fullName}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    Reading <span className="font-medium">{r.readingKwh} kWh</span>
                  </p>
                  {r.flagReason && (
                    <p className="text-sm text-amber-700">{r.flagReason}</p>
                  )}
                  {readingUrls[i] ? (
                    <a href={readingUrls[i]!} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={readingUrls[i]!}
                        alt="Meter"
                        className="h-32 w-auto rounded-md border object-cover"
                      />
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">No meter photo.</p>
                  )}
                  <QueueActions id={r.id} kind="reading" />
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
