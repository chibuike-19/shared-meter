"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setResidentActiveAction } from "./actions";
import { Button } from "@/components/ui/button";

export function ActiveToggle({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const res = await setResidentActiveAction(id, !isActive);
      if (res.ok) {
        toast.success(isActive ? "Resident deactivated" : "Resident activated");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button
      variant={isActive ? "outline" : "default"}
      size="sm"
      onClick={toggle}
      disabled={pending}
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
