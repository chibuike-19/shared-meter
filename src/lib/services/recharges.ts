import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, RechargeRow } from "@/lib/supabase/types";
import { logRechargeSchema, type LogRechargeInput } from "@/lib/validation/schemas";
import { kwhFromNaira } from "@/lib/services/calc";
import { getCurrentPrice } from "@/lib/services/pricing";
import { writeAudit } from "@/lib/services/audit";

type DB = SupabaseClient<Database>;

export interface LogRechargeArgs extends LogRechargeInput {
  /** Storage path of the required receipt/token photo (v1). */
  receiptPath: string;
}

/**
 * Log a recharge (spec §6, §8). Locks the price in effect at `recharged_at`
 * into `price_per_kwh_applied` and computes `kwh_credited`; status is `pending`
 * so it does NOT affect balances until an admin approves it (Phase 5). A
 * receipt photo is required in v1.
 */
export async function logRecharge(
  db: DB,
  args: LogRechargeArgs,
): Promise<RechargeRow> {
  const input = logRechargeSchema.parse(args);
  if (!args.receiptPath) throw new Error("A receipt/token photo is required.");

  const rechargedAt = input.rechargedAt ?? new Date();
  const price = await getCurrentPrice(db, rechargedAt);
  if (price === null) {
    throw new Error("No price is set yet. Ask an admin to set the price first.");
  }

  const kwhCredited = kwhFromNaira(input.amountNaira, price);

  const { data: recharge, error } = await db
    .from("recharges")
    .insert({
      paid_by: input.residentId,
      amount_naira: input.amountNaira,
      price_per_kwh_applied: price,
      kwh_credited: kwhCredited,
      receipt_path: args.receiptPath,
      recharged_at: rechargedAt.toISOString(),
      status: "pending",
      note: input.note ?? null,
      source: input.source,
    })
    .select("*")
    .single();
  if (error || !recharge) throw new Error(`Could not log recharge: ${error?.message}`);

  return recharge;
}

async function loadRecharge(db: DB, rechargeId: string): Promise<RechargeRow> {
  const { data, error } = await db
    .from("recharges")
    .select("*")
    .eq("id", rechargeId)
    .maybeSingle<RechargeRow>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Recharge not found");
  return data;
}

/**
 * Approve a pending recharge (spec §6, §8). It then counts toward balances.
 * An admin who is also the recharger may approve their own — it is audited.
 */
export async function approveRecharge(
  db: DB,
  rechargeId: string,
  adminId: string,
): Promise<RechargeRow> {
  const before = await loadRecharge(db, rechargeId);
  if (before.status !== "pending") {
    throw new Error(`Recharge is already ${before.status}.`);
  }
  const { data, error } = await db
    .from("recharges")
    .update({
      status: "approved",
      approved_by: adminId,
      approved_at: new Date().toISOString(),
      reject_reason: null,
    })
    .eq("id", rechargeId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Approve failed: ${error?.message}`);

  await writeAudit(db, {
    actorId: adminId,
    action: "recharge.approve",
    entity: "recharges",
    entityId: rechargeId,
    before,
    after: data,
  });
  return data;
}

/** Reject a pending recharge with a reason (spec §6, §8). */
export async function rejectRecharge(
  db: DB,
  rechargeId: string,
  adminId: string,
  reason: string,
): Promise<RechargeRow> {
  const before = await loadRecharge(db, rechargeId);
  if (before.status !== "pending") {
    throw new Error(`Recharge is already ${before.status}.`);
  }
  const { data, error } = await db
    .from("recharges")
    .update({ status: "rejected", reject_reason: reason, approved_by: adminId })
    .eq("id", rechargeId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Reject failed: ${error?.message}`);

  await writeAudit(db, {
    actorId: adminId,
    action: "recharge.reject",
    entity: "recharges",
    entityId: rechargeId,
    before,
    after: data,
  });
  return data;
}

/**
 * Timestamp of the most recent APPROVED recharge across the group, or null.
 * Used to prompt residents with stale readings to submit a fresh one (spec §6).
 */
export async function getLatestApprovedRechargeAt(db: DB): Promise<string | null> {
  const { data, error } = await db
    .from("recharges")
    .select("recharged_at")
    .eq("status", "approved")
    .order("recharged_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<RechargeRow, "recharged_at">>();
  if (error) throw new Error(error.message);
  return data?.recharged_at ?? null;
}
