import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ResidentRow } from "@/lib/supabase/types";
import {
  createResidentSchema,
  updateResidentSchema,
  setActiveSchema,
  replaceMeterSchema,
  type CreateResidentInput,
  type UpdateResidentInput,
  type ReplaceMeterInput,
} from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/services/audit";
import { UserError } from "@/lib/errors";

type DB = SupabaseClient<Database>;

/**
 * Residents service. Framework-independent: it imports nothing from Next or
 * React and receives a Supabase client, so the future WhatsApp bot can reuse
 * it unchanged (spec §8, §10). Privileged calls expect the service-role client.
 */

/**
 * Create a resident with an email + password login (no invite email sent) and
 * seed their opening reading. Admin only. The email is auto-confirmed so the
 * resident can sign in immediately with the password the admin shares.
 */
export async function createResident(
  db: DB,
  input: CreateResidentInput,
  actorId: string | null,
): Promise<ResidentRow> {
  const data = createResidentSchema.parse(input);

  // Create the auth user directly with a password; email_confirm skips the
  // confirmation email (keeps the free-tier email quota for resets only).
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    throw new Error(
      `Could not create login for ${data.email}: ${createError?.message ?? "unknown error"}`,
    );
  }

  const { data: resident, error: insertError } = await db
    .from("residents")
    .insert({
      auth_user_id: created.user.id,
      full_name: data.fullName,
      house_label: data.houseLabel,
      phone_e164: data.phoneE164 ?? null,
      role: data.role,
      meter_serial: data.meterSerial ?? null,
      opening_reading: data.openingReading,
      opening_balance_kwh: data.openingBalanceKwh,
    })
    .select("*")
    .single();

  if (insertError || !resident) {
    // Best-effort cleanup so a failed insert doesn't orphan the auth user.
    await db.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw new Error(`Could not create resident: ${insertError?.message}`);
  }

  // Seed an opening reading so interval history starts cleanly (spec §5).
  const { error: readingError } = await db.from("readings").insert({
    resident_id: resident.id,
    reading_kwh: resident.opening_reading,
    status: "accepted",
    source: "opening",
    submitted_by: actorId,
  });
  if (readingError) {
    throw new Error(`Resident created but opening reading failed: ${readingError.message}`);
  }

  await writeAudit(db, {
    actorId,
    action: "resident.create",
    entity: "residents",
    entityId: resident.id,
    after: resident,
  });

  return resident as ResidentRow;
}

/** All residents, newest first. Readable by admin (service role) UI. */
export async function listResidents(db: DB): Promise<ResidentRow[]> {
  const { data, error } = await db
    .from("residents")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResidentRow[];
}

export async function getResident(db: DB, id: string): Promise<ResidentRow | null> {
  const { data, error } = await db
    .from("residents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Look up the resident linked to a Supabase auth user. */
export async function getResidentByAuthUser(
  db: DB,
  authUserId: string,
): Promise<ResidentRow | null> {
  const { data, error } = await db
    .from("residents")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Edit mutable resident fields. Admin only. Audited. */
export async function updateResident(
  db: DB,
  input: UpdateResidentInput,
  actorId: string | null,
): Promise<ResidentRow> {
  const data = updateResidentSchema.parse(input);
  const before = await getResident(db, data.id);
  if (!before) throw new UserError("Resident not found.");

  const patch: Partial<ResidentRow> = {};
  if (data.fullName !== undefined) patch.full_name = data.fullName;
  if (data.houseLabel !== undefined) patch.house_label = data.houseLabel;
  if (data.phoneE164 !== undefined) patch.phone_e164 = data.phoneE164;
  if (data.role !== undefined) patch.role = data.role;
  if (data.meterSerial !== undefined) patch.meter_serial = data.meterSerial;
  if (data.openingReading !== undefined) patch.opening_reading = data.openingReading;
  if (data.openingBalanceKwh !== undefined)
    patch.opening_balance_kwh = data.openingBalanceKwh;

  const { data: updated, error } = await db
    .from("residents")
    .update(patch)
    .eq("id", data.id)
    .select("*")
    .single();
  if (error || !updated) throw new Error(`Update failed: ${error?.message}`);

  await writeAudit(db, {
    actorId,
    action: "resident.update",
    entity: "residents",
    entityId: data.id,
    before,
    after: updated,
  });
  return updated as ResidentRow;
}

/** Activate or deactivate a resident. Admin only. Audited. */
export async function setResidentActive(
  db: DB,
  input: { id: string; isActive: boolean },
  actorId: string | null,
): Promise<ResidentRow> {
  const data = setActiveSchema.parse(input);
  const before = await getResident(db, data.id);
  if (!before) throw new UserError("Resident not found.");

  const { data: updated, error } = await db
    .from("residents")
    .update({ is_active: data.isActive })
    .eq("id", data.id)
    .select("*")
    .single();
  if (error || !updated) throw new Error(`Update failed: ${error?.message}`);

  await writeAudit(db, {
    actorId,
    action: data.isActive ? "resident.activate" : "resident.deactivate",
    entity: "residents",
    entityId: data.id,
    before,
    after: updated,
  });
  return updated as ResidentRow;
}

/**
 * Replace a resident's sub-meter, preserving past consumption (spec §6):
 * consumed_offset += (old_final − opening_reading); opening_reading = new_start;
 * insert an accepted reading of new_start (source 'admin'). Audited.
 */
export async function replaceMeter(
  db: DB,
  input: ReplaceMeterInput,
  adminId: string,
): Promise<ResidentRow> {
  const data = replaceMeterSchema.parse(input);
  const before = await getResident(db, data.residentId);
  if (!before) throw new UserError("Resident not found.");

  const newOffset =
    Number(before.consumed_offset_kwh) +
    (data.oldFinalReading - Number(before.opening_reading));

  const { data: updated, error } = await db
    .from("residents")
    .update({
      consumed_offset_kwh: newOffset,
      opening_reading: data.newStartReading,
    })
    .eq("id", data.residentId)
    .select("*")
    .single();
  if (error || !updated) throw new Error(`Meter replacement failed: ${error?.message}`);

  const { error: readingError } = await db.from("readings").insert({
    resident_id: data.residentId,
    reading_kwh: data.newStartReading,
    status: "accepted",
    source: "admin",
    submitted_by: adminId,
  });
  if (readingError) {
    throw new Error(`Meter replaced but seeding reading failed: ${readingError.message}`);
  }

  await writeAudit(db, {
    actorId: adminId,
    action: "resident.replace_meter",
    entity: "residents",
    entityId: data.residentId,
    before,
    after: updated,
  });
  return updated as ResidentRow;
}

/**
 * Permanently delete a resident: remove their readings/recharges/adjustments
 * (so they leave the group pool entirely) and their auth login, then the
 * resident row. References where this resident acted on OTHER residents' rows
 * are redirected first so foreign keys don't block the delete. Audited.
 * The caller (action layer) must prevent an admin from deleting themselves.
 */
export async function deleteResident(
  db: DB,
  residentId: string,
  adminId: string,
): Promise<void> {
  const before = await getResident(db, residentId);
  if (!before) throw new UserError("Resident not found.");

  // 1) Redirect references where this resident acted on OTHER residents' rows,
  //    so deleting their own rows / row won't violate foreign keys.
  await db.from("readings").update({ submitted_by: null }).eq("submitted_by", residentId).neq("resident_id", residentId);
  await db.from("recharges").update({ approved_by: null }).eq("approved_by", residentId).neq("paid_by", residentId);
  await db.from("adjustments").update({ created_by: adminId }).eq("created_by", residentId).neq("resident_id", residentId);
  await db.from("price_history").update({ set_by: null }).eq("set_by", residentId);
  await db.from("audit_log").update({ actor_id: null }).eq("actor_id", residentId);

  // 2) Delete the resident's own records (removes them from the group pool).
  const delReadings = await db.from("readings").delete().eq("resident_id", residentId);
  if (delReadings.error) throw new Error(`Could not delete readings: ${delReadings.error.message}`);
  const delRecharges = await db.from("recharges").delete().eq("paid_by", residentId);
  if (delRecharges.error) throw new Error(`Could not delete recharges: ${delRecharges.error.message}`);
  const delAdjustments = await db.from("adjustments").delete().eq("resident_id", residentId);
  if (delAdjustments.error) throw new Error(`Could not delete adjustments: ${delAdjustments.error.message}`);

  // 3) Audit the deletion BEFORE removing the row (actor is the admin, not the deleted resident).
  await writeAudit(db, {
    actorId: adminId,
    action: "resident.delete",
    entity: "residents",
    entityId: residentId,
    before,
  });

  // 4) Delete the resident row, then the auth user (order matters: the row's
  //    auth_user_id references auth.users).
  const delResident = await db.from("residents").delete().eq("id", residentId);
  if (delResident.error) throw new Error(`Could not delete resident: ${delResident.error.message}`);

  if (before.auth_user_id) {
    const { error: authErr } = await db.auth.admin.deleteUser(before.auth_user_id);
    if (authErr) {
      throw new Error(`Resident removed, but deleting their login failed: ${authErr.message}`);
    }
  }
}
