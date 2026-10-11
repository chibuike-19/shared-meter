"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminSubmitReadingAction, adminLogRechargeAction } from "../residents/actions";
import { uploadProofFromBrowser } from "@/lib/upload-client";
import { MAX_PROOF_BYTES } from "@/lib/services/storage";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ResidentOption {
  id: string;
  houseLabel: string;
  fullName: string;
}

type Mode = "reading" | "recharge";

export function AdminEntryForm({ residents }: { residents: ResidentOption[] }) {
  const router = useRouter();
  const [residentId, setResidentId] = useState("");
  const [mode, setMode] = useState<Mode>("reading");
  const [value, setValue] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = residents.find((r) => r.id === residentId);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_PROOF_BYTES) {
      setError("That photo is larger than 5 MB.");
      setPhoto(null);
      e.target.value = "";
      return;
    }
    setError(null);
    setPhoto(file);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPhoto(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!residentId) {
      setError("Choose a resident first.");
      return;
    }
    startTransition(async () => {
      try {
        let photoPath = "";
        if (photo) {
          photoPath = await uploadProofFromBrowser(
            mode === "reading" ? "readings" : "receipts",
            photo,
          );
        }
        const fd = new FormData();
        fd.set("residentId", residentId);

        if (mode === "reading") {
          fd.set("valueKwh", value);
          if (photoPath) fd.set("photoPath", photoPath);
          const res = await adminSubmitReadingAction(fd);
          if (!res.ok) return setError(res.error);
          if (res.outcome === "duplicate") toast.info("Already recorded a moment ago.");
          else
            toast.success(
              `Reading saved for ${selected?.houseLabel} (used ${res.usedKwh} kWh).`,
            );
          setValue("");
        } else {
          fd.set("amountNaira", amount);
          fd.set("note", note);
          if (photoPath) fd.set("receiptPath", photoPath);
          const res = await adminLogRechargeAction(fd);
          if (!res.ok) return setError(res.error);
          toast.success(
            `Recharge logged for ${selected?.houseLabel} — ${res.kwhCredited} kWh at ₦${res.pricePerKwh}/kWh (pending).`,
          );
          setAmount("");
          setNote("");
        }
        setPhoto(null);
        router.refresh();
      } catch (err) {
        setError(friendlyError(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="resident">Resident</Label>
        <select
          id="resident"
          value={residentId}
          onChange={(e) => setResidentId(e.target.value)}
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="" disabled>
            Select a resident…
          </option>
          {residents.map((r) => (
            <option key={r.id} value={r.id}>
              {r.houseLabel} · {r.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="inline-flex rounded-md border p-1">
        <button
          type="button"
          onClick={() => switchMode("reading")}
          className={`rounded px-3 py-1.5 text-sm ${
            mode === "reading" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Meter reading
        </button>
        <button
          type="button"
          onClick={() => switchMode("recharge")}
          className={`rounded px-3 py-1.5 text-sm ${
            mode === "recharge" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Recharge
        </button>
      </div>

      {mode === "reading" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="valueKwh">Meter reading (kWh)</Label>
            <Input
              id="valueKwh"
              type="number"
              inputMode="decimal"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reading-photo">Meter photo (optional)</Label>
            <Input id="reading-photo" type="file" accept="image/*" onChange={onPickPhoto} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amountNaira">Amount (₦)</Label>
            <Input
              id="amountNaira"
              type="number"
              inputMode="decimal"
              step="any"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              kWh credited is calculated from this and the current price.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-photo">Receipt photo (optional)</Label>
            <Input id="receipt-photo" type="file" accept="image/*" onChange={onPickPhoto} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : mode === "reading"
            ? "Save reading"
            : "Log recharge"}
      </Button>
    </form>
  );
}
