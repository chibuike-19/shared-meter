import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";
import type { Database } from "@/lib/supabase/types";
import { getBalance, getGroupSummary, suggestNextRecharger } from "@/lib/services/balances";
import { getCurrentPrice } from "@/lib/services/pricing";
import { getSubmissionHistory, getSubmissionById } from "@/lib/services/submissions";

/**
 * Read-only integration check against the live Supabase project. Skipped unless
 * RUN_DB_IT=1 (so normal `pnpm test` on Node 20 stays green). Run with:
 *   RUN_DB_IT=1 /opt/homebrew/opt/node@23/bin/node node_modules/vitest/vitest.mjs run tests/db.integration.test.ts
 */
const run = process.env.RUN_DB_IT === "1";

function env(key: string): string {
  const text = readFileSync(".env.local", "utf8");
  return (text.match(new RegExp(`^${key}=(.*)$`, "m")) ?? [])[1]?.trim() ?? "";
}

describe.runIf(run)("DB-backed calc services (live, read-only)", () => {
  let db: SupabaseClient<Database>;

  beforeAll(() => {
    if (typeof globalThis.WebSocket === "undefined") {
      (globalThis as { WebSocket?: unknown }).WebSocket = WS;
    }
    db = createClient<Database>(
      env("NEXT_PUBLIC_SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
  });

  it("reads the current price", async () => {
    const price = await getCurrentPrice(db);
    expect(price).not.toBeNull();
    expect(price).toBeGreaterThan(0);
  });

  it("builds a coherent group summary", async () => {
    const summary = await getGroupSummary(db);
    expect(Array.isArray(summary.rows)).toBe(true);
    // group pool must equal the sum of the rows' balances it reports.
    const sum = summary.rows.reduce((a, r) => a + r.balanceKwh, 0);
    expect(summary.groupPoolKwh).toBeCloseTo(sum, 3);
    // totals balance must match the pool too.
    expect(summary.totals.balanceKwh).toBeCloseTo(summary.groupPoolKwh, 3);
    console.log(
      "group summary:",
      JSON.stringify(
        {
          price: summary.pricePerKwh,
          residents: summary.rows.map((r) => ({
            house: r.houseLabel,
            paidFor: r.paidForKwh,
            consumed: r.consumedKwh,
            balance: r.balanceKwh,
          })),
          pool: summary.groupPoolKwh,
          pending: summary.pending.length,
          next: summary.nextRecharger?.houseLabel ?? null,
        },
        null,
        2,
      ),
    );
  });

  it("returns a next-recharger ranking consistent with the rows", async () => {
    const [summary, next] = await Promise.all([
      getGroupSummary(db),
      suggestNextRecharger(db),
    ]);
    expect(next.ranking.length).toBe(summary.rows.length);
    // ranking is sorted most-negative first
    for (let i = 1; i < next.ranking.length; i++) {
      expect(next.ranking[i].balanceKwh).toBeGreaterThanOrEqual(
        next.ranking[i - 1].balanceKwh,
      );
    }
  });

  it("getBalance matches the corresponding group row", async () => {
    const summary = await getGroupSummary(db);
    if (summary.rows.length === 0) return;
    const first = summary.rows[0];
    const one = await getBalance(db, first.residentId);
    expect(one?.balanceKwh).toBeCloseTo(first.balanceKwh, 3);
    expect(one?.nairaEquivalent).not.toBeNull();
  });

  it("getSubmissionHistory returns well-formed entries with signed proofs", async () => {
    const summary = await getGroupSummary(db);
    if (summary.rows.length === 0) return;
    const history = await getSubmissionHistory(db, summary.rows[0].residentId);
    expect(Array.isArray(history)).toBe(true);
    for (const s of history) {
      expect(["reading", "recharge"]).toContain(s.kind);
      expect(typeof s.initiatorName).toBe("string");
      // a proof path, when present, must yield a usable signed URL
      if (s.proofViewUrl) expect(s.proofViewUrl).toContain("token=");
    }
    console.log(
      "submission history sample:",
      JSON.stringify(
        history.slice(0, 3).map((s) => ({
          kind: s.kind,
          status: s.status,
          reason: s.reason,
          decidedBy: s.decidedByName,
          hasProof: !!s.proofViewUrl,
        })),
      ),
    );

    // The audit-log side panel fetches one item by id via getSubmissionById.
    if (history.length) {
      const first = history[0];
      const byId = await getSubmissionById(db, first.kind, first.id);
      expect(byId?.id).toBe(first.id);
      expect(byId?.kind).toBe(first.kind);
    }
  });
});
