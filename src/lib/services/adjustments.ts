import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, AdjustmentRow } from "@/lib/supabase/types";
import { addAdjustmentSchema, type AddAdjustmentInput } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/services/audit";

type DB = SupabaseClient<Database>;

/**
 * Add a manual kWh correction for a resident (spec §6, §8). Admin only,
 * positive or negative, reason required, visible to everyone in their history.
 */
export async function addAdjustment(
  db: DB,
  input: AddAdjustmentInput,
  adminId: string,
): Promise<AdjustmentRow> {
  const data = addAdjustmentSchema.parse(input);
  const { data: row, error } = await db
    .from("adjustments")
    .insert({
      resident_id: data.residentId,
      kwh_delta: data.kwhDelta,
      reason: data.reason,
      created_by: adminId,
    })
    .select("*")
    .single();
  if (error || !row) throw new Error(`Could not add adjustment: ${error?.message}`);

  await writeAudit(db, {
    actorId: adminId,
    action: "adjustment.create",
    entity: "adjustments",
    entityId: row.id,
    after: row,
  });
  return row;
}
