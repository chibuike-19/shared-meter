import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ReadingRow, ResidentRow } from "@/lib/supabase/types";
import { submitReadingSchema, type SubmitReadingInput } from "@/lib/validation/schemas";
import { decideReading, type LastReading } from "@/lib/services/reading-rules";
import { getNumberSetting } from "@/lib/services/settings";
import { writeAudit } from "@/lib/services/audit";

type DB = SupabaseClient<Database>;

export type SubmitReadingResult =
  | { outcome: "duplicate" }
  | {
      outcome: "accepted" | "flagged";
      reading: ReadingRow;
      usedKwh: number;
      flagReason?: string;
    };

export interface SubmitReadingArgs extends SubmitReadingInput {
  /** Storage path of the required meter photo (v1). */
  photoPath: string;
  /** Admins may back-date/forward-date freely (spec §6). */
  isAdmin?: boolean;
}

/**
 * Submit a meter reading (spec §6, §8). Applies `decideReading`:
 * lower → throws, duplicate → no-op, implausible jump → flagged (excluded from
 * balances), otherwise accepted. A photo is required in v1.
 * Framework-independent; the route/action uploads the photo and authorizes.
 */
export async function submitReading(
  db: DB,
  args: SubmitReadingArgs,
  actorId: string | null,
): Promise<SubmitReadingResult> {
  const input = submitReadingSchema.parse(args);
  if (!args.photoPath) throw new Error("A meter photo is required.");

  const lastAccepted = await loadLastAccepted(db, input.residentId);
  const jumpThresholdPerDay = await getNumberSetting(db, "jump_threshold_kwh_per_day");
  const now = new Date();
  const takenAt = input.takenAt ?? now;

  const decision = decideReading({
    valueKwh: input.valueKwh,
    lastAccepted,
    takenAt,
    now,
    jumpThresholdPerDay,
    isAdmin: args.isAdmin ?? false,
  });

  if (decision.action === "reject") throw new Error(decision.reason);
  if (decision.action === "duplicate") return { outcome: "duplicate" };

  const { data: reading, error } = await db
    .from("readings")
    .insert({
      resident_id: input.residentId,
      reading_kwh: input.valueKwh,
      taken_at: takenAt.toISOString(),
      photo_path: args.photoPath,
      status: decision.status,
      flag_reason: decision.flagReason ?? null,
      source: input.source,
      submitted_by: actorId,
    })
    .select("*")
    .single();
  if (error || !reading) throw new Error(`Could not save reading: ${error?.message}`);

  return {
    outcome: decision.status,
    reading,
    usedKwh: decision.usedKwh,
    flagReason: decision.flagReason,
  };
}

async function loadReading(db: DB, readingId: string): Promise<ReadingRow> {
  const { data, error } = await db
    .from("readings")
    .select("*")
    .eq("id", readingId)
    .maybeSingle<ReadingRow>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Reading not found");
  return data;
}

/** Admin accepts a flagged reading so it counts toward balances (spec §6, §8). */
export async function acceptReading(
  db: DB,
  readingId: string,
  adminId: string,
): Promise<ReadingRow> {
  const before = await loadReading(db, readingId);
  const { data, error } = await db
    .from("readings")
    .update({ status: "accepted", flag_reason: null })
    .eq("id", readingId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Accept failed: ${error?.message}`);

  await writeAudit(db, {
    actorId: adminId,
    action: "reading.accept",
    entity: "readings",
    entityId: readingId,
    before,
    after: data,
  });
  return data;
}

/** Admin rejects a reading, excluding it from balances (spec §6, §8). */
export async function rejectReading(
  db: DB,
  readingId: string,
  adminId: string,
  reason?: string,
): Promise<ReadingRow> {
  const before = await loadReading(db, readingId);
  const { data, error } = await db
    .from("readings")
    .update({ status: "rejected", flag_reason: reason ?? before.flag_reason })
    .eq("id", readingId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Reject failed: ${error?.message}`);

  await writeAudit(db, {
    actorId: adminId,
    action: "reading.reject",
    entity: "readings",
    entityId: readingId,
    before,
    after: data,
  });
  return data;
}

/** Most recent accepted reading; falls back to the opening reading. */
async function loadLastAccepted(db: DB, residentId: string): Promise<LastReading> {
  const { data, error } = await db
    .from("readings")
    .select("reading_kwh, taken_at, created_at")
    .eq("resident_id", residentId)
    .eq("status", "accepted")
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<ReadingRow, "reading_kwh" | "taken_at" | "created_at">>();
  if (error) throw new Error(error.message);

  if (data) {
    return {
      readingKwh: Number(data.reading_kwh),
      takenAt: data.taken_at,
      createdAt: data.created_at,
    };
  }

  // No readings at all (shouldn't happen — opening is seeded) — use opening.
  const { data: resident, error: rErr } = await db
    .from("residents")
    .select("opening_reading, created_at")
    .eq("id", residentId)
    .single<Pick<ResidentRow, "opening_reading" | "created_at">>();
  if (rErr || !resident) throw new Error("Resident not found");
  return {
    readingKwh: Number(resident.opening_reading),
    takenAt: resident.created_at,
    createdAt: resident.created_at,
  };
}
