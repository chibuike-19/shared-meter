"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logRechargeAction } from "./actions";
import { uploadProofFromBrowser } from "@/lib/upload-client";
import { MAX_PROOF_BYTES } from "@/lib/services/storage";
import { RequiredMark } from "@/components/required-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function LogRechargeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const receipt = fd.get("receipt");
    if (!(receipt instanceof File) || receipt.size === 0) {
      setError("A receipt/token photo is required.");
      return;
    }
    // Upload the file from the browser, then send only its path to the action.
    fd.delete("receipt");
    startTransition(async () => {
      try {
        const receiptPath = await uploadProofFromBrowser("receipts", receipt);
        fd.set("receiptPath", receiptPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Photo upload failed.");
        return;
      }
      const res = await logRechargeAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        `Logged — ${res.kwhCredited} kWh at ₦${res.pricePerKwh}/kWh. Pending admin approval.`,
      );
      setOpen(false);
      form.reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Log recharge
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a recharge</DialogTitle>
          <DialogDescription>
            Record a top-up of the shared meter. It counts once an admin approves it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amountNaira">
              Amount (₦)
              <RequiredMark />
            </Label>
            <Input
              id="amountNaira"
              name="amountNaira"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1"
              placeholder="40000"
              required
            />
            <p className="text-xs text-muted-foreground">
              kWh credited is calculated from this and the current price per unit.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt">
              Receipt / token photo
              <RequiredMark />
            </Label>
            <Input
              id="receipt"
              name="receipt"
              type="file"
              accept="image/*"
              required
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && file.size > MAX_PROOF_BYTES) {
                  setError("That photo is larger than 5 MB. Please choose a smaller one.");
                  e.target.value = "";
                } else {
                  setError(null);
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Max 5 MB.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rechargedAt">Date &amp; time</Label>
            <Input id="rechargedAt" name="rechargedAt" type="datetime-local" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" name="note" rows={2} placeholder="optional" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log recharge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
