import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PriceHistoryRow } from "@/lib/supabase/types";
import { setPriceSchema, type SetPriceInput } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/services/audit";

type DB = SupabaseClient<Database>;

/**
 * Current price = the price_history row with the greatest effective_from ≤ `at`
 * (spec §6). Returns null if no price is in effect yet. `setPrice` lands in
 * Phase 5; this read-side lookup is needed by Phase 2+ calculations.
 */
export async function getCurrentPrice(
  db: DB,
  at: Date = new Date(),
): Promise<number | null> {
  const { data, error } = await db
    .from("price_history")
    .select("price_per_kwh")
    .lte("effective_from", at.toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.price_per_kwh) : null;
}

export interface PriceHistoryEntry extends PriceHistoryRow {
  isCurrent: boolean; // the price in effect right now
  isScheduled: boolean; // effective_from is in the future
}

/**
 * Full price history, newest effective_from first, annotated with which row is
 * current / scheduled (spec §7.3 admin Price). Time is evaluated here (a plain
 * service function) rather than in a React component.
 */
export async function getPriceHistory(db: DB): Promise<PriceHistoryEntry[]> {
  const { data, error } = await db
    .from("price_history")
    .select("*")
    .order("effective_from", { ascending: false })
    .returns<PriceHistoryRow[]>();
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const now = Date.now();
  // The current row is the first (latest) one already in effect.
  const currentId = rows.find((r) => new Date(r.effective_from).getTime() <= now)?.id;
  return rows.map((r) => ({
    ...r,
    isCurrent: r.id === currentId,
    isScheduled: new Date(r.effective_from).getTime() > now,
  }));
}

/**
 * Add a new price row (spec §6). Rows are never edited or deleted; the current
 * price is simply the latest one whose effective_from ≤ now. Past recharges keep
 * the price locked at their own recharge time, so this only affects the future.
 */
export async function setPrice(
  db: DB,
  input: SetPriceInput,
  adminId: string,
): Promise<PriceHistoryRow> {
  const data = setPriceSchema.parse(input);
  const { data: row, error } = await db
    .from("price_history")
    .insert({
      price_per_kwh: data.pricePerKwh,
      effective_from: data.effectiveFrom.toISOString(),
      set_by: adminId,
    })
    .select("*")
    .single();
  if (error || !row) throw new Error(`Could not set price: ${error?.message}`);

  await writeAudit(db, {
    actorId: adminId,
    action: "price.set",
    entity: "price_history",
    entityId: row.id,
    after: row,
  });
  return row;
}
