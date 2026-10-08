import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ResidentBalanceView,
  RechargeRow,
  ResidentRow,
} from "@/lib/supabase/types";
import {
  groupPoolKwh,
  nairaEquivalent,
  rankNextRechargers,
  roundTo,
  suggestRecharge,
} from "@/lib/services/calc";
import { getCurrentPrice } from "@/lib/services/pricing";
import { getNumberSetting } from "@/lib/services/settings";

type DB = SupabaseClient<Database>;

/** numeric columns arrive as strings from PostgREST; coerce defensively. */
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface ResidentBalance {
  residentId: string;
  fullName: string;
  houseLabel: string;
  paidForKwh: number; // recharges + opening balance + adjustments
  consumedKwh: number;
  balanceKwh: number;
  rechargeCount: number;
  latestReading: number;
  lastReadingAt: string | null;
  pricePerKwh: number | null;
  nairaEquivalent: number | null; // balance in ₦ at current price
}

function toResidentBalance(
  row: ResidentBalanceView,
  price: number | null,
): ResidentBalance {
  const balanceKwh = num(row.balance_kwh);
  return {
    residentId: row.resident_id,
    fullName: row.full_name,
    houseLabel: row.house_label,
    paidForKwh: roundTo(num(row.recharged_kwh) + num(row.other_credit_kwh), 3),
    consumedKwh: num(row.consumed_kwh),
    balanceKwh,
    rechargeCount: num(row.recharge_count),
    latestReading: num(row.latest_reading),
    lastReadingAt: row.last_reading_at,
    pricePerKwh: price,
    nairaEquivalent: price === null ? null : nairaEquivalent(balanceKwh, price),
  };
}

/** One resident's balance + as-of + naira equivalent (spec §8 getBalance). */
export async function getBalance(
  db: DB,
  residentId: string,
): Promise<ResidentBalance | null> {
  const [{ data, error }, price] = await Promise.all([
    db
      .from("resident_balances")
      .select("*")
      .eq("resident_id", residentId)
      .maybeSingle<ResidentBalanceView>(),
    getCurrentPrice(db),
  ]);
  if (error) throw new Error(error.message);
  return data ? toResidentBalance(data, price) : null;
}

export interface RechargerSuggestion {
  residentId: string;
  houseLabel: string;
  fullName: string;
  balanceKwh: number;
  suggestedNaira: number;
  suggestedKwh: number;
}

export interface NextRechargerResult {
  pricePerKwh: number | null;
  ranking: RechargerSuggestion[]; // most negative first
  top: RechargerSuggestion | null; // the single most-owing resident, if any owe
}

function toSuggestion(b: ResidentBalance, price: number, rounding: number): RechargerSuggestion {
  const suggestedNaira = suggestRecharge(b.balanceKwh, price, rounding);
  return {
    residentId: b.residentId,
    houseLabel: b.houseLabel,
    fullName: b.fullName,
    balanceKwh: b.balanceKwh,
    suggestedNaira,
    suggestedKwh: price > 0 ? roundTo(suggestedNaira / price, 3) : 0,
  };
}

/** Ranking of who should recharge next + suggested naira (spec §8). */
export async function suggestNextRecharger(db: DB): Promise<NextRechargerResult> {
  const [rows, price, rounding] = await Promise.all([
    activeBalances(db),
    getCurrentPrice(db),
    getNumberSetting(db, "rounding_naira"),
  ]);

  if (price === null) {
    return { pricePerKwh: null, ranking: [], top: null };
  }

  const ranked = rankNextRechargers(
    rows.map((r) => ({ resident: r, balanceKwh: r.balanceKwh })),
  ).map(({ resident }) => toSuggestion(resident, price, rounding));

  const top = ranked.find((r) => r.balanceKwh < 0) ?? null;
  return { pricePerKwh: price, ranking: ranked, top };
}

export interface PendingRecharge {
  id: string;
  paidBy: string;
  houseLabel: string;
  fullName: string;
  amountNaira: number;
  kwhCredited: number;
  rechargedAt: string;
}

export interface GroupSummary {
  pricePerKwh: number | null;
  staleDays: number;
  rows: ResidentBalance[];
  totals: { paidForKwh: number; consumedKwh: number; balanceKwh: number };
  groupPoolKwh: number;
  nextRecharger: RechargerSuggestion | null;
  ranking: RechargerSuggestion[];
  pending: PendingRecharge[];
}

/** Everything the group transparency page needs (spec §7, §8 getGroupSummary). */
export async function getGroupSummary(db: DB): Promise<GroupSummary> {
  const [rows, price, rounding, staleDays, pending] = await Promise.all([
    activeBalances(db),
    getCurrentPrice(db),
    getNumberSetting(db, "rounding_naira"),
    getNumberSetting(db, "stale_days"),
    pendingRecharges(db),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      paidForKwh: acc.paidForKwh + r.paidForKwh,
      consumedKwh: acc.consumedKwh + r.consumedKwh,
      balanceKwh: acc.balanceKwh + r.balanceKwh,
    }),
    { paidForKwh: 0, consumedKwh: 0, balanceKwh: 0 },
  );

  let ranking: RechargerSuggestion[] = [];
  let nextRecharger: RechargerSuggestion | null = null;
  if (price !== null) {
    ranking = rankNextRechargers(
      rows.map((r) => ({ resident: r, balanceKwh: r.balanceKwh })),
    ).map(({ resident }) => toSuggestion(resident, price, rounding));
    nextRecharger = ranking.find((r) => r.balanceKwh < 0) ?? null;
  }

  return {
    pricePerKwh: price,
    staleDays,
    rows,
    totals: {
      paidForKwh: roundTo(totals.paidForKwh, 3),
      consumedKwh: roundTo(totals.consumedKwh, 3),
      balanceKwh: roundTo(totals.balanceKwh, 3),
    },
    groupPoolKwh: groupPoolKwh(rows.map((r) => r.balanceKwh)),
    nextRecharger,
    ranking,
    pending,
  };
}

// --- internals ---------------------------------------------------------------

async function activeBalances(db: DB): Promise<ResidentBalance[]> {
  const [{ data, error }, price] = await Promise.all([
    db
      .from("resident_balances")
      .select("*")
      .order("house_label", { ascending: true })
      .returns<ResidentBalanceView[]>(),
    getCurrentPrice(db),
  ]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toResidentBalance(row, price));
}

async function pendingRecharges(db: DB): Promise<PendingRecharge[]> {
  const { data, error } = await db
    .from("recharges")
    .select("id, paid_by, amount_naira, kwh_credited, recharged_at")
    .eq("status", "pending")
    .order("recharged_at", { ascending: false })
    .returns<
      Pick<
        RechargeRow,
        "id" | "paid_by" | "amount_naira" | "kwh_credited" | "recharged_at"
      >[]
    >();
  if (error) throw new Error(error.message);
  const pending = data ?? [];
  if (pending.length === 0) return [];

  // Resolve payer names/houses without relying on embedded-join typings.
  const ids = [...new Set(pending.map((p) => p.paid_by))];
  const { data: residents, error: rErr } = await db
    .from("residents")
    .select("id, full_name, house_label")
    .in("id", ids)
    .returns<Pick<ResidentRow, "id" | "full_name" | "house_label">[]>();
  if (rErr) throw new Error(rErr.message);
  const byId = new Map((residents ?? []).map((r) => [r.id, r]));

  return pending.map((p) => {
    const r = byId.get(p.paid_by);
    return {
      id: p.id,
      paidBy: p.paid_by,
      houseLabel: r?.house_label ?? "—",
      fullName: r?.full_name ?? "Unknown",
      amountNaira: num(p.amount_naira),
      kwhCredited: num(p.kwh_credited),
      rechargedAt: p.recharged_at,
    };
  });
}
