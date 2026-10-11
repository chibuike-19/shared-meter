"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createResidentAction } from "./actions";
import { suggestEmailFix } from "@/lib/email-hint";
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
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFix, setEmailFix] = useState<{ typed: string; suggested: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function runCreate(form: HTMLFormElement) {
    setError(null);
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await createResidentAction(null, formData);
      if (res.ok) {
        toast.success("Resident created. Share their email and password so they can sign in.");
        setOpen(false);
        setEmailFix(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    const fix = suggestEmailFix(email);
    // Flag a likely typo and ask before creating — a wrong email means the
    // resident can never sign in.
    if (fix && fix.toLowerCase() !== email.toLowerCase()) {
      setEmailFix({ typed: email, suggested: fix });
      return;
    }
    runCreate(form);
  }

  function useSuggestion() {
    const form = formRef.current;
    if (!form || !emailFix) return;
    const input = form.elements.namedItem("email") as HTMLInputElement | null;
    if (input) input.value = emailFix.suggested;
    setEmailFix(null);
    runCreate(form);
  }

  function keepTyped() {
    const form = formRef.current;
    setEmailFix(null);
    if (form) runCreate(form);
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
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
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
              step="any"
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

          {emailFix && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                That email looks like it might be a typo. Did you mean{" "}
                <strong className="break-all">{emailFix.suggested}</strong> instead of{" "}
                <span className="break-all">{emailFix.typed}</span>?
              </p>
              <p className="text-xs">
                A wrong email means this person won&apos;t be able to sign in.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" size="sm" onClick={useSuggestion} disabled={pending}>
                  Use {emailFix.suggested}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={keepTyped}
                  disabled={pending}
                >
                  Keep what I typed
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create resident"}
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
