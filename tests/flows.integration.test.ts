import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";
import type { Database } from "@/lib/supabase/types";
import { submitReading } from "@/lib/services/readings";
import { logRecharge } from "@/lib/services/recharges";
import { getBalance } from "@/lib/services/balances";
import { getCurrentPrice } from "@/lib/services/pricing";
import { kwhFromNaira } from "@/lib/services/calc";

/**
 * Live, self-cleaning verification of Phase 3's done-when (spec §12):
 * a lower reading is rejected, a huge jump is flagged (and excluded from
 * balances), and a pending recharge does not change balances.
 * Skipped unless RUN_DB_IT=1; run on Node 22+.
 */
const run = process.env.RUN_DB_IT === "1";

function env(key: string): string {
  const text = readFileSync(".env.local", "utf8");
  return (text.match(new RegExp(`^${key}=(.*)$`, "m")) ?? [])[1]?.trim() ?? "";
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe.runIf(run)("Phase 3 flows (live, self-cleaning)", () => {
  let db: SupabaseClient<Database>;
  let residentId: string;

  beforeAll(async () => {
    if (typeof globalThis.WebSocket === "undefined") {
      (globalThis as { WebSocket?: unknown }).WebSocket = WS;
    }
    db = createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Temp resident (no auth user, no email) with opening reading 1000 taken 10 days ago.
    const { data: r, error } = await db
      .from("residents")
      .insert({
        full_name: "TEST Phase3",
        house_label: `TEST-${Math.floor(Date.now() / 1000)}`,
        role: "resident",
        opening_reading: 1000,
      })
      .select("id")
      .single();
    if (error || !r) throw new Error(`setup failed: ${error?.message}`);
    residentId = r.id;

    const { error: readErr } = await db.from("readings").insert({
      resident_id: residentId,
      reading_kwh: 1000,
      status: "accepted",
      source: "opening",
      taken_at: daysAgo(10),
    });
    if (readErr) throw new Error(`setup reading failed: ${readErr.message}`);
  });

  afterAll(async () => {
    if (!residentId) return;
    await db.from("recharges").delete().eq("paid_by", residentId);
    await db.from("readings").delete().eq("resident_id", residentId);
    await db.from("residents").delete().eq("id", residentId);
  });

  it("accepts a normal reading and computes consumption", async () => {
    const res = await submitReading(
      db,
      { residentId, valueKwh: 1030, source: "web", photoPath: "test/dummy.jpg" },
      residentId,
    );
    expect(res.outcome).toBe("accepted");
    const bal = await getBalance(db, residentId);
    expect(bal?.consumedKwh).toBeCloseTo(30, 3);
    expect(bal?.balanceKwh).toBeCloseTo(-30, 3); // no credit yet
  });

  it("rejects a reading lower than the last accepted one", async () => {
    await expect(
      submitReading(
        db,
        { residentId, valueKwh: 1020, source: "web", photoPath: "test/dummy.jpg" },
        residentId,
      ),
    ).rejects.toThrow(/1030/);
  });

  it("flags an implausible jump and excludes it from the balance", async () => {
    const before = await getBalance(db, residentId);
    const res = await submitReading(
      db,
      { residentId, valueKwh: 6000, source: "web", photoPath: "test/dummy.jpg" },
      residentId,
    );
    expect(res.outcome).toBe("flagged");
    const after = await getBalance(db, residentId);
    // flagged reading must NOT move the balance
    expect(after?.balanceKwh).toBeCloseTo(before!.balanceKwh, 3);
    expect(after?.consumedKwh).toBeCloseTo(30, 3);
  });

  it("does not change the balance for a pending recharge", async () => {
    const before = await getBalance(db, residentId);
    const price = await getCurrentPrice(db);
    const recharge = await logRecharge(db, {
      residentId,
      amountNaira: 40000,
      source: "web",
      receiptPath: "test/dummy.jpg",
    });
    expect(recharge.status).toBe("pending");
    // kWh credited is derived from the amount and the current price.
    expect(Number(recharge.kwh_credited)).toBeCloseTo(kwhFromNaira(40000, price!), 3);

    const after = await getBalance(db, residentId);
    expect(after?.balanceKwh).toBeCloseTo(before!.balanceKwh, 3); // unchanged
    expect(after?.paidForKwh).toBeCloseTo(0, 3); // pending not counted
  });
});
