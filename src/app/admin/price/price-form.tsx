"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setPriceAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddPriceForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await setPriceAction(fd);
      if (res.ok) {
        toast.success("New price added. It applies to future recharges only.");
        form.reset();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor="pricePerKwh">Price per kWh (₦)</Label>
        <Input
          id="pricePerKwh"
          name="pricePerKwh"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          placeholder="220"
          required
          className="w-32"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="effectiveFrom">Effective from</Label>
        <Input id="effectiveFrom" name="effectiveFrom" type="datetime-local" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add price"}
      </Button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
