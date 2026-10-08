import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ReadingIntervalView,
  RechargeRow,
  AdjustmentRow,
  ResidentRow,
  RechargeStatus,
} from "@/lib/supabase/types";
import { roundTo } from "@/lib/services/calc";

type DB = SupabaseClient<Database>;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface TimelineResidentInfo {
  id: string;
  fullName: string;
  houseLabel: string;
  openingReading: number;
  openingBalanceKwh: number;
}

export type TimelineEvent =
  | {
      kind: "interval";
      id: string;
      at: string;
      fromTime: string | null;
      fromReading: number | null;
      toReading: number;
      usedKwh: number;
      counted: true;
      runningBalanceKwh: number;
    }
  | {
      kind: "recharge";
      id: string;
      at: string;
      amountNaira: number;
      kwhCredited: number;
      priceApplied: number;
      status: RechargeStatus;
      counted: boolean; // only approved recharges affect the balance
      runningBalanceKwh: number;
    }
  | {
      kind: "adjustment";
      id: string;
      at: string;
      kwhDelta: number;
      reason: string;
      counted: true;
      runningBalanceKwh: number;
    };

export interface ResidentTimeline {
  resident: TimelineResidentInfo;
  events: TimelineEvent[]; // most recent first
  currentBalanceKwh: number;
}

/**
 * Combined history for one resident (spec §7.4, §8): reading intervals
 * (consumption), recharges (all statuses) and adjustments, with a running
 * balance after each event. Only accepted readings, approved recharges and
 * adjustments move the balance; pending/rejected recharges are shown but not
 * counted. Returns null if the resident doesn't exist.
 */
export async function getResidentTimeline(
  db: DB,
  residentId: string,
): Promise<ResidentTimeline | null> {
  const { data: r, error: rErr } = await db
    .from("residents")
    .select("id, full_name, house_label, opening_reading, opening_balance_kwh")
    .eq("id", residentId)
    .maybeSingle<
      Pick<
        ResidentRow,
        "id" | "full_name" | "house_label" | "opening_reading" | "opening_balance_kwh"
      >
    >();
  if (rErr) throw new Error(rErr.message);
  if (!r) return null;

  const [intervalsRes, rechargesRes, adjustmentsRes] = await Promise.all([
    db
      .from("reading_intervals")
      .select("*")
      .eq("resident_id", residentId)
      .order("to_time", { ascending: true })
      .returns<ReadingIntervalView[]>(),
    db
      .from("recharges")
      .select("id, amount_naira, kwh_credited, price_per_kwh_applied, status, recharged_at")
      .eq("paid_by", residentId)
      .order("recharged_at", { ascending: true })
      .returns<
        Pick<
          RechargeRow,
          "id" | "amount_naira" | "kwh_credited" | "price_per_kwh_applied" | "status" | "recharged_at"
        >[]
      >(),
    db
      .from("adjustments")
      .select("id, kwh_delta, reason, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: true })
      .returns<Pick<AdjustmentRow, "id" | "kwh_delta" | "reason" | "created_at">[]>(),
  ]);
  if (intervalsRes.error) throw new Error(intervalsRes.error.message);
  if (rechargesRes.error) throw new Error(rechargesRes.error.message);
  if (adjustmentsRes.error) throw new Error(adjustmentsRes.error.message);

  // Build undated event descriptors (sort key = `at`), ascending.
  type Pending =
    | { t: "interval"; at: string; row: ReadingIntervalView; i: number }
    | { t: "recharge"; at: string; row: (typeof rechargesRes.data)[number] }
    | { t: "adjustment"; at: string; row: (typeof adjustmentsRes.data)[number] };

  const pending: Pending[] = [];

  (intervalsRes.data ?? []).forEach((row, i) => {
    // The opening-reading baseline row has a null used_kwh — skip it.
    if (row.used_kwh == null || row.from_time == null) return;
    pending.push({ t: "interval", at: row.to_time, row, i });
  });
  (rechargesRes.data ?? []).forEach((row) => {
    pending.push({ t: "recharge", at: row.recharged_at, row });
  });
  (adjustmentsRes.data ?? []).forEach((row) => {
    pending.push({ t: "adjustment", at: row.created_at, row });
  });

  pending.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Running balance starts at the carry-over opening balance.
  let running = num(r.opening_balance_kwh);
  const events: TimelineEvent[] = [];

  for (const p of pending) {
    if (p.t === "interval") {
      const usedKwh = num(p.row.used_kwh);
      running = roundTo(running - usedKwh, 3);
      events.push({
        kind: "interval",
        id: `${residentId}-int-${p.i}`,
        at: p.at,
        fromTime: p.row.from_time,
        fromReading: p.row.from_reading == null ? null : num(p.row.from_reading),
        toReading: num(p.row.to_reading),
        usedKwh,
        counted: true,
        runningBalanceKwh: running,
      });
    } else if (p.t === "recharge") {
      const kwhCredited = num(p.row.kwh_credited);
      const counted = p.row.status === "approved";
      if (counted) running = roundTo(running + kwhCredited, 3);
      events.push({
        kind: "recharge",
        id: p.row.id,
        at: p.at,
        amountNaira: num(p.row.amount_naira),
        kwhCredited,
        priceApplied: num(p.row.price_per_kwh_applied),
        status: p.row.status,
        counted,
        runningBalanceKwh: running,
      });
    } else {
      const kwhDelta = num(p.row.kwh_delta);
      running = roundTo(running + kwhDelta, 3);
      events.push({
        kind: "adjustment",
        id: p.row.id,
        at: p.at,
        kwhDelta,
        reason: p.row.reason,
        counted: true,
        runningBalanceKwh: running,
      });
    }
  }

  return {
    resident: {
      id: r.id,
      fullName: r.full_name,
      houseLabel: r.house_label,
      openingReading: num(r.opening_reading),
      openingBalanceKwh: num(r.opening_balance_kwh),
    },
    events: events.reverse(), // most recent first
    currentBalanceKwh: running,
  };
}
