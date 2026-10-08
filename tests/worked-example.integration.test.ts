import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";
import type { Database } from "@/lib/supabase/types";
import { getGroupSummary } from "@/lib/services/balances";
import { getResidentTimeline } from "@/lib/services/timeline";

/**
 * Live, self-cleaning verification of the spec §4 worked example through the
 * SQL views + getGroupSummary (Phase 4 done-when: "numbers match the worked
 * example"). Skipped unless RUN_DB_IT=1; run on Node 22+.
 */
const run = process.env.RUN_DB_IT === "1";

function env(key: string): string {
  const text = readFileSync(".env.local", "utf8");
  return (text.match(new RegExp(`^${key}=(.*)$`, "m")) ?? [])[1]?.trim() ?? "";
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

interface Fixture {
  key: "A" | "B" | "C" | "D";
  opening: number;
  latest: number;
}

const FIXTURES: Fixture[] = [
  { key: "A", opening: 1240, latest: 1300 }, // consumed 60, +200 recharge → +140
  { key: "B", opening: 980, latest: 1030 }, // consumed 50 → −50
  { key: "C", opening: 1550, latest: 1605 }, // consumed 55 → −55
  { key: "D", opening: 760, latest: 795 }, // consumed 35 → −35
];

describe.runIf(run)("worked example via views (live, self-cleaning)", () => {
  let db: SupabaseClient<Database>;
  const ids: Record<string, string> = {};
  const stamp = Math.floor(Date.now() / 1000);

  beforeAll(async () => {
    if (typeof globalThis.WebSocket === "undefined") {
      (globalThis as { WebSocket?: unknown }).WebSocket = WS;
    }
    db = createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    for (const f of FIXTURES) {
      const { data: r, error } = await db
        .from("residents")
        .insert({
          full_name: `TEST ${f.key}`,
          house_label: `TEST-${f.key}-${stamp}`,
          role: "resident",
          opening_reading: f.opening,
        })
        .select("id")
        .single();
      if (error || !r) throw new Error(`setup ${f.key} failed: ${error?.message}`);
      ids[f.key] = r.id;

      // opening reading (10 days ago) + latest reading (now), both accepted
      const { error: rdErr } = await db.from("readings").insert([
        {
          resident_id: r.id,
          reading_kwh: f.opening,
          status: "accepted",
          source: "opening",
          taken_at: daysAgo(10),
        },
        {
          resident_id: r.id,
          reading_kwh: f.latest,
          status: "accepted",
          source: "web",
          taken_at: daysAgo(0),
        },
      ]);
      if (rdErr) throw new Error(`setup readings ${f.key} failed: ${rdErr.message}`);
    }

    // A recharges ₦40,000 at ₦200/kWh, APPROVED → +200 kWh
    const { error: rcErr } = await db.from("recharges").insert({
      paid_by: ids.A,
      amount_naira: 40000,
      price_per_kwh_applied: 200,
      kwh_credited: 200,
      status: "approved",
      recharged_at: daysAgo(1),
    });
    if (rcErr) throw new Error(`setup recharge failed: ${rcErr.message}`);
  });

  afterAll(async () => {
    const all = Object.values(ids);
    if (all.length === 0) return;
    await db.from("recharges").delete().in("paid_by", all);
    await db.from("readings").delete().in("resident_id", all);
    await db.from("residents").delete().in("id", all);
  });

  it("produces A +140, B −50, C −55, D −35 with pool 0 over the four", async () => {
    const summary = await getGroupSummary(db);
    const byId = new Map(summary.rows.map((r) => [r.residentId, r]));

    const A = byId.get(ids.A)!;
    const B = byId.get(ids.B)!;
    const C = byId.get(ids.C)!;
    const D = byId.get(ids.D)!;

    expect(A.consumedKwh).toBeCloseTo(60, 3);
    expect(B.consumedKwh).toBeCloseTo(50, 3);
    expect(C.consumedKwh).toBeCloseTo(55, 3);
    expect(D.consumedKwh).toBeCloseTo(35, 3);

    expect(A.paidForKwh).toBeCloseTo(200, 3);
    expect(B.paidForKwh).toBeCloseTo(0, 3);

    expect(A.balanceKwh).toBeCloseTo(140, 3);
    expect(B.balanceKwh).toBeCloseTo(-50, 3);
    expect(C.balanceKwh).toBeCloseTo(-55, 3);
    expect(D.balanceKwh).toBeCloseTo(-35, 3);

    const poolOfFour = A.balanceKwh + B.balanceKwh + C.balanceKwh + D.balanceKwh;
    expect(poolOfFour).toBeCloseTo(0, 3);
  });

  it("names C as the next recharger at ₦11,000", async () => {
    const summary = await getGroupSummary(db);
    expect(summary.nextRecharger?.residentId).toBe(ids.C);
    expect(summary.nextRecharger?.suggestedNaira).toBe(11000);
  });

  it("A's timeline running balance ends at +140 and includes the recharge", async () => {
    const tl = await getResidentTimeline(db, ids.A);
    expect(tl?.currentBalanceKwh).toBeCloseTo(140, 3);
    const recharge = tl?.events.find((e) => e.kind === "recharge");
    expect(recharge).toBeTruthy();
    if (recharge && recharge.kind === "recharge") {
      expect(recharge.kwhCredited).toBeCloseTo(200, 3);
      expect(recharge.counted).toBe(true);
    }
  });
});
