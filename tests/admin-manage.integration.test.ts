import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";
import type { Database } from "@/lib/supabase/types";
import {
  createResident,
  getResident,
  deleteResident,
} from "@/lib/services/residents";
import { submitReading } from "@/lib/services/readings";
import { logRecharge } from "@/lib/services/recharges";
import { getBalance } from "@/lib/services/balances";

/**
 * Live, self-cleaning check of admin-on-behalf submissions and resident
 * deletion (incl. foreign-key cleanup + auth-user removal). RUN_DB_IT=1, Node 22+.
 */
const run = process.env.RUN_DB_IT === "1";
function env(key: string): string {
  const text = readFileSync(".env.local", "utf8");
  return (text.match(new RegExp(`^${key}=(.*)$`, "m")) ?? [])[1]?.trim() ?? "";
}

describe.runIf(run)("admin manage (live, self-cleaning)", () => {
  let db: SupabaseClient<Database>;
  let residentId = "";
  let authUserId: string | null = null;
  let adminId = "";
  const stamp = Math.floor(Date.now() / 1000);
  const email = `test+del${stamp}@example.com`;

  beforeAll(async () => {
    if (typeof globalThis.WebSocket === "undefined") {
      (globalThis as { WebSocket?: unknown }).WebSocket = WS;
    }
    db = createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: admin } = await db
      .from("residents")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .single();
    adminId = admin!.id;

    const resident = await createResident(
      db,
      {
        fullName: "TEST Delete",
        houseLabel: `TEST-DEL-${stamp}`,
        email,
        password: "supersecret8",
        role: "resident",
        openingReading: 1000,
        openingBalanceKwh: 0,
      },
      adminId,
    );
    residentId = resident.id;
    authUserId = resident.auth_user_id;
  });

  afterAll(async () => {
    // Best-effort cleanup if the delete test didn't run.
    if (residentId) {
      const still = await getResident(db, residentId);
      if (still) {
        await db.from("recharges").delete().eq("paid_by", residentId);
        await db.from("readings").delete().eq("resident_id", residentId);
        await db.from("audit_log").delete().eq("actor_id", residentId);
        await db.from("residents").delete().eq("id", residentId);
      }
    }
    if (authUserId) await db.auth.admin.deleteUser(authUserId).catch(() => {});
  });

  it("admin submits a reading on behalf (trusted, big jump accepted)", async () => {
    const res = await submitReading(
      db,
      { residentId, valueKwh: 1100, source: "admin", isAdmin: true },
      adminId,
    );
    expect(res.outcome).toBe("accepted"); // not flagged, despite a +100 jump
    const bal = await getBalance(db, residentId);
    expect(bal?.consumedKwh).toBeCloseTo(100, 3);
    expect(bal?.balanceKwh).toBeCloseTo(-100, 3);
  });

  it("admin logs a recharge on behalf (pending, no balance change)", async () => {
    const before = await getBalance(db, residentId);
    const recharge = await logRecharge(db, {
      residentId,
      amountNaira: 10000,
      source: "admin",
    });
    expect(recharge.status).toBe("pending");
    const after = await getBalance(db, residentId);
    expect(after?.balanceKwh).toBeCloseTo(before!.balanceKwh, 3); // pending doesn't count
  });

  it("deletes the resident, their records, and their auth login", async () => {
    await deleteResident(db, residentId, adminId);

    // Resident row gone.
    expect(await getResident(db, residentId)).toBeNull();

    // Their records gone.
    const { count: readingCount } = await db
      .from("readings")
      .select("id", { count: "exact", head: true })
      .eq("resident_id", residentId);
    expect(readingCount ?? 0).toBe(0);
    const { count: rechargeCount } = await db
      .from("recharges")
      .select("id", { count: "exact", head: true })
      .eq("paid_by", residentId);
    expect(rechargeCount ?? 0).toBe(0);

    // Auth login gone.
    let found = false;
    for (let page = 1; page <= 5; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (data.users.some((u) => u.email?.toLowerCase() === email)) found = true;
      if (data.users.length < 1000) break;
    }
    expect(found).toBe(false);

    // Mark cleaned so afterAll doesn't retry.
    residentId = "";
    authUserId = null;
  });
});
