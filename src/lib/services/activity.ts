import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ReadingRow,
  RechargeRow,
  ResidentRow,
  ReadingStatus,
  RechargeStatus,
} from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type ActivityEvent =
  | {
      kind: "reading";
      id: string;
      at: string; // created_at (sort key)
      occurredAt: string; // taken_at
      residentId: string;
      houseLabel: string;
      fullName: string;
      readingKwh: number;
      status: ReadingStatus;
      reason: string | null;
    }
  | {
      kind: "recharge";
      id: string;
      at: string; // created_at (sort key)
      occurredAt: string; // recharged_at
      residentId: string;
      houseLabel: string;
      fullName: string;
      amountNaira: number;
      kwhCredited: number;
      status: RechargeStatus;
      reason: string | null;
    };

/**
 * Recent group activity — readings and recharges (spec §7.7). Read with the
 * caller's client so RLS enforces transparency: everyone sees accepted readings
 * and approved recharges plus their own pending/flagged items.
 */
export async function getActivityFeed(db: DB, limit = 50): Promise<ActivityEvent[]> {
  const [readingsRes, rechargesRes] = await Promise.all([
    db
      .from("readings")
      .select("id, resident_id, reading_kwh, taken_at, status, flag_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<
        Pick<
          ReadingRow,
          "id" | "resident_id" | "reading_kwh" | "taken_at" | "status" | "flag_reason" | "created_at"
        >[]
      >(),
    db
      .from("recharges")
      .select("id, paid_by, amount_naira, kwh_credited, recharged_at, status, reject_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<
        Pick<
          RechargeRow,
          | "id" | "paid_by" | "amount_naira" | "kwh_credited" | "recharged_at"
          | "status" | "reject_reason" | "created_at"
        >[]
      >(),
  ]);
  if (readingsRes.error) throw new Error(readingsRes.error.message);
  if (rechargesRes.error) throw new Error(rechargesRes.error.message);

  const readings = readingsRes.data ?? [];
  const recharges = rechargesRes.data ?? [];

  const ids = [
    ...new Set([
      ...readings.map((r) => r.resident_id),
      ...recharges.map((r) => r.paid_by),
    ]),
  ];
  const byId = await residentMap(db, ids);

  const events: ActivityEvent[] = [
    ...readings.map((r): ActivityEvent => {
      const who = byId.get(r.resident_id);
      return {
        kind: "reading",
        id: r.id,
        at: r.created_at,
        occurredAt: r.taken_at,
        residentId: r.resident_id,
        houseLabel: who?.house_label ?? "—",
        fullName: who?.full_name ?? "Unknown",
        readingKwh: num(r.reading_kwh),
        status: r.status,
        reason: r.flag_reason,
      };
    }),
    ...recharges.map((r): ActivityEvent => {
      const who = byId.get(r.paid_by);
      return {
        kind: "recharge",
        id: r.id,
        at: r.created_at,
        occurredAt: r.recharged_at,
        residentId: r.paid_by,
        houseLabel: who?.house_label ?? "—",
        fullName: who?.full_name ?? "Unknown",
        amountNaira: num(r.amount_naira),
        kwhCredited: num(r.kwh_credited),
        status: r.status,
        reason: r.reject_reason,
      };
    }),
  ];

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events.slice(0, limit);
}

async function residentMap(
  db: DB,
  ids: string[],
): Promise<Map<string, Pick<ResidentRow, "id" | "full_name" | "house_label">>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from("residents")
    .select("id, full_name, house_label")
    .in("id", ids)
    .returns<Pick<ResidentRow, "id" | "full_name" | "house_label">[]>();
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.id, r]));
}
