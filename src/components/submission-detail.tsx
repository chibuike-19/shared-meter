"use client";

import type { Submission } from "@/lib/services/submissions";
import { Badge } from "@/components/ui/badge";

const fmtNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
const fmtKwh = (n: number) => `${n.toLocaleString("en-NG", { maximumFractionDigits: 3 })} kWh`;
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function StatusBadge({ status }: { status: string }) {
  if (status === "accepted" || status === "approved")
    return <Badge variant="outline" className="border-green-500 text-green-700">{status}</Badge>;
  if (status === "flagged" || status === "pending")
    return <Badge variant="outline" className="border-amber-500 text-amber-700">{status}</Badge>;
  return <Badge variant="outline" className="border-red-500 text-red-700">{status}</Badge>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/** Full detail of one reading/recharge — shared by the resident history
 * accordion and the admin audit-log side panel. */
export function SubmissionDetail({ submission: s }: { submission: Submission }) {
  const rejected = s.status === "rejected";
  return (
    <div>
      {rejected && s.reason && (
        <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
          <strong>Rejected:</strong> {s.reason}
        </p>
      )}
      {s.status === "flagged" && s.reason && (
        <p className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Flagged:</strong> {s.reason} — waiting for an admin check.
        </p>
      )}

      <dl className="divide-y text-sm">
        {s.kind === "reading" ? (
          <Row label="Meter reading" value={fmtKwh(s.readingKwh ?? 0)} />
        ) : (
          <>
            <Row label="Amount paid" value={fmtNaira(s.amountNaira ?? 0)} />
            <Row label="kWh credited" value={fmtKwh(s.kwhCredited ?? 0)} />
            <Row label="Price applied" value={`${fmtNaira(s.pricePerKwh ?? 0)}/kWh`} />
            {s.note && <Row label="Note" value={s.note} />}
          </>
        )}
        <Row label="Status" value={<StatusBadge status={s.status} />} />
        <Row label="Initiated by" value={`${s.initiatorName} (${s.source})`} />
        <Row label="Date & time" value={fmtDateTime(s.occurredAt)} />
        <Row label="Submitted" value={fmtDateTime(s.createdAt)} />
        {s.decisionLabel && (
          <Row
            label={`${s.decisionLabel} by`}
            value={
              <>
                {s.decidedByName}
                <span className="block text-xs text-muted-foreground">
                  {fmtDateTime(s.decidedAt)}
                </span>
              </>
            }
          />
        )}
      </dl>

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Proof photo</p>
        {s.proofViewUrl ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.proofViewUrl}
              alt="Proof"
              className="max-h-56 w-auto rounded-md border object-contain"
            />
            {s.proofDownloadUrl && (
              <a
                href={s.proofDownloadUrl}
                className="inline-block text-sm text-primary underline underline-offset-4"
              >
                Download photo
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No photo on file.</p>
        )}
      </div>
    </div>
  );
}
