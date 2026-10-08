"use client";

import { useState, useTransition } from "react";
import type { AuditEntryView } from "@/lib/services/admin-queries";
import type { Submission } from "@/lib/services/submissions";
import { auditActionLabel } from "@/lib/audit-labels";
import { auditItemDetailAction } from "../actions";
import { SubmissionDetail } from "@/components/submission-detail";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

const DETAILABLE: Record<string, "reading" | "recharge"> = {
  readings: "reading",
  recharges: "recharge",
};

export function AuditTable({ entries }: { entries: AuditEntryView[] }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDetail(kind: "reading" | "recharge", id: string) {
    setOpen(true);
    setDetail(null);
    setError(null);
    startTransition(async () => {
      const res = await auditItemDetailAction(kind, id);
      if (res.ok) {
        if (!res.submission) setError("That item no longer exists.");
        setDetail(res.submission);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No audit entries.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => {
                const kind = e.entityId ? DETAILABLE[e.entity] : undefined;
                const clickable = !!kind;
                return (
                  <TableRow
                    key={e.id}
                    className={clickable ? "cursor-pointer" : undefined}
                    onClick={clickable ? () => openDetail(kind!, e.entityId!) : undefined}
                    title={clickable ? "View details" : undefined}
                  >
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDateTime(e.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{e.actorName}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {auditActionLabel(e.action)}
                      {clickable && <span className="ml-1 text-xs text-primary">›</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.entity}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{detail ? `${detail.kind === "reading" ? "Reading" : "Recharge"} detail` : "Detail"}</SheetTitle>
            <SheetDescription>Full record, decision history and proof.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {pending ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : detail ? (
              <SubmissionDetail submission={detail} />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
