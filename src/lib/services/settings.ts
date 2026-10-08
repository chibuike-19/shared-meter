import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { updateSettingSchema, type UpdateSettingInput } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/services/audit";

type DB = SupabaseClient<Database>;

/** Defaults mirror the seed in 0001_schema.sql. */
export const SETTING_DEFAULTS = {
  stale_days: 7,
  jump_threshold_kwh_per_day: 40,
  rounding_naira: 100,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/** Read a numeric setting, falling back to its seeded default. */
export async function getNumberSetting(db: DB, key: SettingKey): Promise<number> {
  const { data, error } = await db
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const value = data?.value;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : SETTING_DEFAULTS[key];
}

/** Read all known numeric settings at once. */
export async function getSettings(db: DB): Promise<Record<SettingKey, number>> {
  const { data, error } = await db.from("settings").select("key, value");
  if (error) throw new Error(error.message);
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, number>;
  for (const row of data ?? []) {
    if (row.key in out) {
      const n = typeof row.value === "number" ? row.value : Number(row.value);
      if (Number.isFinite(n)) out[row.key as SettingKey] = n;
    }
  }
  return out;
}

/** Upsert a numeric setting (spec §7 admin Settings). Admin only. Audited. */
export async function updateSetting(
  db: DB,
  input: UpdateSettingInput,
  adminId: string,
): Promise<void> {
  const data = updateSettingSchema.parse(input);
  const { error } = await db
    .from("settings")
    .upsert({ key: data.key, value: data.value as never }, { onConflict: "key" });
  if (error) throw new Error(`Could not save setting: ${error.message}`);

  await writeAudit(db, {
    actorId: adminId,
    action: "setting.update",
    entity: "settings",
    entityId: null,
    after: { key: data.key, value: data.value },
  });
}
