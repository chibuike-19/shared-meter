"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitReadingAction } from "./actions";
import { uploadProofFromBrowser } from "@/lib/upload-client";
import { MAX_PROOF_BYTES } from "@/lib/services/storage";
import { RequiredMark } from "@/components/required-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SubmitReadingDialog({
  latestReading,
  lastReadingAt,
}: {
  latestReading: number;
  lastReadingAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [value, setValue] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep("form");
    setValue("");
    setPhoto(null);
    setError(null);
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_PROOF_BYTES) {
      setError("That photo is larger than 5 MB. Please choose a smaller one.");
      setPhoto(null);
      e.target.value = "";
      return;
    }
    setError(null);
    setPhoto(file);
  }

  const numValue = Number(value);
  const used = Number.isFinite(numValue) ? numValue - latestReading : 0;
  const sinceLabel = lastReadingAt
    ? new Date(lastReadingAt).toLocaleString("en-NG")
    : "your opening reading";

  function goToConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!value || !Number.isFinite(numValue)) {
      setError("Enter the kWh number from your sub-meter.");
      return;
    }
    if (numValue < latestReading) {
      setError(
        `Your last reading was ${latestReading}. A new reading must be the same or higher.`,
      );
      return;
    }
    if (!photo) {
      setError("A photo of the meter is required.");
      return;
    }
    setStep("confirm");
  }

  function confirmSubmit() {
    startTransition(async () => {
      let photoPath: string;
      try {
        // Upload straight to Storage from the browser (keeps the file out of
        // the Server Action's 1 MB body limit).
        photoPath = await uploadProofFromBrowser("readings", photo!);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Photo upload failed.");
        setStep("form");
        return;
      }

      const fd = new FormData();
      fd.set("valueKwh", value);
      fd.set("photoPath", photoPath);
      const res = await submitReadingAction(fd);
      if (!res.ok) {
        setError(res.error);
        setStep("form");
        return;
      }
      if (res.outcome === "duplicate") {
        toast.info("That reading was already recorded a moment ago.");
      } else if (res.outcome === "flagged") {
        toast.warning("Reading saved but flagged — waiting for admin check.");
      } else {
        toast.success(`Reading accepted — you used ${res.usedKwh} kWh.`);
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full">Submit reading</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit meter reading</DialogTitle>
          <DialogDescription>
            Type the kWh total shown on your sub-meter and attach a photo of it.
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <form onSubmit={goToConfirm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="valueKwh">
                Meter reading (kWh)
                <RequiredMark />
              </Label>
              <Input
                id="valueKwh"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={latestReading}
                placeholder={`≥ ${latestReading}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Last accepted reading: {latestReading} kWh
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo">
                Meter photo
                <RequiredMark />
              </Label>
              <Input
                id="photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPickPhoto}
                required
              />
              <p className="text-xs text-muted-foreground">Max 5 MB.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button type="submit">Review</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                You used{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {used} kWh
                </span>{" "}
                since {sinceLabel}.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                New reading: {numValue} kWh · {photo?.name}
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("form")} disabled={pending}>
                Back
              </Button>
              <Button onClick={confirmSubmit} disabled={pending}>
                {pending ? "Submitting…" : "Confirm & submit"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
