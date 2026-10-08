"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  approveRechargeAction,
  rejectRechargeAction,
  acceptReadingAction,
  rejectReadingAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function QueueActions({ id, kind }: { id: string; kind: "recharge" | "reading" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    startTransition(async () => {
      const res = kind === "recharge" ? await approveRechargeAction(id) : await acceptReadingAction(id);
      if (res.ok) {
        toast.success(kind === "recharge" ? "Recharge approved." : "Reading accepted.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function reject() {
    setError(null);
    if (kind === "recharge" && !reason.trim()) {
      setError("A reason is required to reject a recharge.");
      return;
    }
    startTransition(async () => {
      const res =
        kind === "recharge"
          ? await rejectRechargeAction(id, reason)
          : await rejectReadingAction(id, reason);
      if (res.ok) {
        toast.success(kind === "recharge" ? "Recharge rejected." : "Reading rejected.");
        setRejectOpen(false);
        setReason("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={approve} disabled={pending}>
        {kind === "recharge" ? "Approve" : "Accept"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={pending}>
        Reject
      </Button>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {kind}</DialogTitle>
            <DialogDescription>
              {kind === "recharge"
                ? "Give a reason — the resident will see it."
                : "Optionally note why this reading is rejected."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={pending}>
              Confirm reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
