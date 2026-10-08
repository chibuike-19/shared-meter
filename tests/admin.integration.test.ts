import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";
import type { Database } from "@/lib/supabase/types";
import { logRecharge, approveRecharge } from "@/lib/services/recharges";
import { setPrice, getCurrentPrice } from "@/lib/services/pricing";
import { getBalance } from "@/lib/services/balances";
import { getAuditLog } from "@/lib/services/admin-queries";
import { kwhFromNaira, roundTo } from "@/lib/services/calc";

/**
 * Live, self-cleaning verification of Phase 5's done-when (spec §12):
 * approving a recharge updates balances, and a price change affects only
 * future recharges. Skipped unless RUN_DB_IT=1; run on Node 22+.
 */
const run = process.env.RUN_DB_IT === "1";

function env(key: string): string {
  const text = readFileSync(".env.local", "utf8");
  return (text.match(new RegExp(`^${key}=(.*)$`, "m")) ?? [])[1]?.trim() ?? "";
}
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe.runIf(run)("admin flows (live, self-cleaning)", () => {
  let db: SupabaseClient<Database>;
  let residentId: string;
  const priceIds: string[] = [];

  beforeAll(async () => {
    if (typeof globalThis.WebSocket === "undefined") {
      (globalThis as { WebSocket?: unknown }).WebSocket = WS;
    }
    db = createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: r, error } = await db
      .from("residents")
      .insert({
        full_name: "TEST Admin5",
        house_label: `TEST5-${Math.floor(Date.now() / 1000)}`,
        role: "resident",
        opening_reading: 1000,
      })
      .select("id")
      .single();
    if (error || !r) throw new Error(`setup failed: ${error?.message}`);
    residentId = r.id;

    await db.from("readings").insert([
      { resident_id: residentId, reading_kwh: 1000, status: "accepted", source: "opening", taken_at: daysAgo(10) },
      { resident_id: residentId, reading_kwh: 1030, status: "accepted", source: "web", taken_at: daysAgo(1) },
    ]);
  });

  afterAll(async () => {
    if (!residentId) return;
    await db.from("recharges").delete().eq("paid_by", residentId);
    await db.from("readings").delete().eq("resident_id", residentId);
    await db.from("audit_log").delete().eq("actor_id", residentId);
    if (priceIds.length) await db.from("price_history").delete().in("id", priceIds);
    await db.from("residents").delete().eq("id", residentId);
  });

  const stash = globalThis as Record<string, unknown>;

  it("approving a recharge updates the balance", async () => {
    const price0 = (await getCurrentPrice(db))!; // whatever the admin has set
    const r1Kwh = kwhFromNaira(40000, price0);

    const before = await getBalance(db, residentId);
    expect(before?.balanceKwh).toBeCloseTo(-30, 3); // consumed 30, no credit

    // Log at the current price → pending, credit derived from amount/price.
    const r1 = await logRecharge(db, {
      residentId,
      amountNaira: 40000,
      source: "web",
      receiptPath: "test/dummy.jpg",
    });
    expect(Number(r1.kwh_credited)).toBeCloseTo(r1Kwh, 3);

    // Pending → balance unchanged.
    expect((await getBalance(db, residentId))?.balanceKwh).toBeCloseTo(-30, 3);

    // Approve → balance jumps by the credited kWh.
    await approveRecharge(db, r1.id, residentId);
    expect((await getBalance(db, residentId))?.balanceKwh).toBeCloseTo(roundTo(-30 + r1Kwh, 3), 3);

    // Approval was audited.
    const log = await getAuditLog(db, { entity: "recharges", action: "recharge.approve" });
    expect(log.some((e) => e.entityId === r1.id)).toBe(true);

    // Carry context to the price-lock test.
    stash.__r1Id = r1.id;
    stash.__price0 = price0;
    stash.__r1Kwh = r1Kwh;
  });

  it("a price change affects only future recharges", async () => {
    const r1Id = stash.__r1Id as string;
    const price0 = stash.__price0 as number;
    const r1Kwh = stash.__r1Kwh as number;

    // Change the price to a clearly different value, effective now.
    const newPriceValue = roundTo(price0 + 50, 2);
    const newPrice = await setPrice(
      db,
      { pricePerKwh: newPriceValue, effectiveFrom: new Date(Date.now() - 1000) },
      residentId,
    );
    priceIds.push(newPrice.id);
    expect(await getCurrentPrice(db)).toBeCloseTo(newPriceValue, 2);

    // A new recharge locks the NEW price.
    const r2Kwh = kwhFromNaira(22000, newPriceValue);
    const r2 = await logRecharge(db, {
      residentId,
      amountNaira: 22000,
      source: "web",
      receiptPath: "test/dummy.jpg",
    });
    expect(Number(r2.kwh_credited)).toBeCloseTo(r2Kwh, 3);
    await approveRecharge(db, r2.id, residentId);

    // The earlier recharge's locked credit/price is unchanged by the new price.
    const { data: r1 } = await db
      .from("recharges")
      .select("kwh_credited, price_per_kwh_applied")
      .eq("id", r1Id)
      .single();
    expect(Number(r1!.kwh_credited)).toBeCloseTo(r1Kwh, 3);
    expect(Number(r1!.price_per_kwh_applied)).toBeCloseTo(price0, 2);

    // Balance reflects both approved recharges: -30 + r1 + r2.
    expect((await getBalance(db, residentId))?.balanceKwh).toBeCloseTo(
      roundTo(-30 + r1Kwh + r2Kwh, 3),
      3,
    );
  });
});
