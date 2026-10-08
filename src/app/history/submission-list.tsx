"use client";

import type { Submission } from "@/lib/services/submissions";
import { SubmissionDetail, StatusBadge } from "@/components/submission-detail";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const fmtNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
const fmtKwh = (n: number) => `${n.toLocaleString("en-NG", { maximumFractionDigits: 3 })} kWh`;
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function SubmissionList({ submissions }: { submissions: Submission[] }) {
  if (submissions.length === 0) {
    return (
      <p className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
        You haven&apos;t submitted any readings or recharges yet.
      </p>
    );
  }

  return (
    <Accordion type="single" collapsible className="space-y-2">
      {submissions.map((s) => (
        <AccordionItem
          key={`${s.kind}-${s.id}`}
          value={`${s.kind}-${s.id}`}
          className="rounded-lg border bg-white px-3"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="flex flex-1 items-center justify-between gap-3 pr-2">
              <div className="text-left">
                <p className="text-sm font-medium">
                  {s.kind === "reading"
                    ? `Reading · ${fmtKwh(s.readingKwh ?? 0)}`
                    : `Recharge · ${fmtNaira(s.amountNaira ?? 0)}`}
                </p>
                <p className="text-xs text-muted-foreground">{fmtDateTime(s.occurredAt)}</p>
              </div>
              <StatusBadge status={s.status} />
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <SubmissionDetail submission={s} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
