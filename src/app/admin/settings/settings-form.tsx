"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSettingAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingRow({
  settingKey,
  label,
  help,
  initial,
  unit,
}: {
  settingKey: string;
  label: string;
  help: string;
  initial: number;
  unit: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(initial));
  const [pending, startTransition] = useTransition();

  const dirty = Number(value) !== initial;

  function save() {
    startTransition(async () => {
      const res = await updateSettingAction(settingKey, Number(value));
      if (res.ok) {
        toast.success(`${label} saved.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b py-4 last:border-0">
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor={settingKey}>{label}</Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex items-center gap-2">
          <Input
            id={settingKey}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
        <Button size="sm" onClick={save} disabled={pending || !dirty || !value}>
          Save
        </Button>
      </div>
    </div>
  );
}
