"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateResidentAction, replaceMeterAction } from "./actions";
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

export interface EditableResident {
  id: string;
  full_name: string;
  house_label: string;
  phone_e164: string | null;
  role: "admin" | "resident";
  meter_serial: string | null;
  opening_reading: number;
  opening_balance_kwh: number;
}

export function EditResidentDialog({ resident }: { resident: EditableResident }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("id", resident.id);
    startTransition(async () => {
      const res = await updateResidentAction(null, fd);
      if (res.ok) {
        toast.success("Resident updated.");
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {resident.house_label}</DialogTitle>
          <DialogDescription>Update details, opening reading and balance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field name="fullName" label="Full name" defaultValue={resident.full_name} required />
          <Field name="houseLabel" label="House label" defaultValue={resident.house_label} required />
          <Field name="phoneE164" label="Phone (E.164)" defaultValue={resident.phone_e164 ?? ""} />
          <Field name="meterSerial" label="Meter serial" defaultValue={resident.meter_serial ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="openingReading"
              label="Opening reading (kWh)"
              type="number"
              step="0.01"
              defaultValue={String(resident.opening_reading)}
            />
            <Field
              name="openingBalanceKwh"
              label="Opening balance (kWh)"
              type="number"
              step="0.001"
              defaultValue={String(resident.opening_balance_kwh)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`role-${resident.id}`}>Role</Label>
            <select
              id={`role-${resident.id}`}
              name="role"
              defaultValue={resident.role}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="resident">Resident</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReplaceMeterDialog({
  resident,
}: {
  resident: { id: string; house_label: string; opening_reading: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("residentId", resident.id);
    startTransition(async () => {
      const res = await replaceMeterAction(null, fd);
      if (res.ok) {
        toast.success("Meter replaced. Past consumption preserved.");
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Replace meter
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Replace meter · {resident.house_label}</DialogTitle>
          <DialogDescription>
            Enter the old meter&apos;s final reading and the new meter&apos;s starting
            reading. Past consumption is preserved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            name="oldFinalReading"
            label="Old meter final reading (kWh)"
            type="number"
            step="0.01"
            required
          />
          <Field
            name="newStartReading"
            label="New meter start reading (kWh)"
            type="number"
            step="0.01"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Replace meter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
