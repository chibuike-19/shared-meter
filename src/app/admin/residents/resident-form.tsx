"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createResidentAction } from "./actions";
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

export function AddResidentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createResidentAction(null, formData);
      if (res.ok) {
        toast.success("Resident created. Share their email and password so they can sign in.");
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
        <Button>Add resident</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add resident</DialogTitle>
          <DialogDescription>
            Creates an email + password login and seeds their opening reading.
            Share the password with the resident; they can change it later via
            &ldquo;Forgot password&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field name="fullName" label="Full name" required />
          <Field name="houseLabel" label="House label" placeholder="House C" required />
          <Field name="email" label="Email" type="email" required />
          <Field
            name="password"
            label="Initial password"
            type="text"
            minLength={8}
            placeholder="min. 8 characters"
            required
          />
          <Field name="phoneE164" label="Phone (E.164)" placeholder="+2348012345678" />
          <Field name="meterSerial" label="Meter serial (optional)" />
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="openingReading"
              label="Opening reading (kWh)"
              type="number"
              step="0.01"
              required
            />
            <Field
              name="openingBalanceKwh"
              label="Opening balance (kWh)"
              type="number"
              step="0.001"
              defaultValue="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              name="role"
              defaultValue="resident"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="resident">Resident</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Inviting…" : "Invite resident"}
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
