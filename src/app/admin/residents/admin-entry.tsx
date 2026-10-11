"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteResidentAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteResidentButton({
  resident,
}: {
  resident: { id: string; house_label: string; full_name: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteResidentAction(resident.id);
      if (res.ok) {
        toast.success(`${resident.house_label} deleted.`);
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
        <Button size="sm" variant="destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {resident.house_label}?</DialogTitle>
          <DialogDescription>
            This permanently removes {resident.full_name} ({resident.house_label}),
            all their readings and recharges, and their login. They leave the group
            pool entirely. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
