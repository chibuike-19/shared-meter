import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ReadingRow,
  RechargeRow,
  ResidentRow,
  AuditLogRow,
  ReadingStatus,
} from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function residentMap(db: DB, ids: string[]) {
  if (ids.length === 0)
    return new Map<string, Pick<ResidentRow, "id" | "full_name" | "house_label">>();
  const { data, error } = await db
    .from("residents")
    .select("id, full_name, house_label")
    .in("id", ids)
    .returns<Pick<ResidentRow, "id" | "full_name" | "house_label">[]>();
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.id, r]));
}

export interface PendingRechargeDetail {
  id: string;
  residentId: string;
  houseLabel: string;
  fullName: string;
  amountNaira: number;
  kwhCredited: number;
  pricePerKwh: number;
  note: string | null;
  receiptPath: string | null;
  rechargedAt: string;
}

export interface FlaggedReadingDetail {
  id: string;
  residentId: string;
  houseLabel: string;
  fullName: string;
  readingKwh: number;
  flagReason: string | null;
  photoPath: string | null;
  takenAt: string;
}

export interface ApprovalsQueue {
  recharges: PendingRechargeDetail[];
  flaggedReadings: FlaggedReadingDetail[];
}

/** Pending recharges + flagged readings awaiting admin action (spec §7 admin). */
export async function getApprovalsQueue(db: DB): Promise<ApprovalsQueue> {
  const [rechargesRes, readingsRes] = await Promise.all([
    db
      .from("recharges")
      .select(
        "id, paid_by, amount_naira, kwh_credited, price_per_kwh_applied, note, receipt_path, recharged_at",
      )
      .eq("status", "pending")
      .order("recharged_at", { ascending: true })
      .returns<
        Pick<
          RechargeRow,
          | "id"
          | "paid_by"
          | "amount_naira"
          | "kwh_credited"
          | "price_per_kwh_applied"
          | "note"
          | "receipt_path"
          | "recharged_at"
        >[]
      >(),
    db
      .from("readings")
      .select("id, resident_id, reading_kwh, flag_reason, photo_path, taken_at")
      .eq("status", "flagged")
      .order("taken_at", { ascending: true })
      .returns<
        Pick<
          ReadingRow,
          "id" | "resident_id" | "reading_kwh" | "flag_reason" | "photo_path" | "taken_at"
        >[]
      >(),
  ]);
  if (rechargesRes.error) throw new Error(rechargesRes.error.message);
  if (readingsRes.error) throw new Error(readingsRes.error.message);

  const recharges = rechargesRes.data ?? [];
  const readings = readingsRes.data ?? [];
  const byId = await residentMap(db, [
    ...new Set([...recharges.map((r) => r.paid_by), ...readings.map((r) => r.resident_id)]),
  ]);

  return {
    recharges: recharges.map((r) => {
      const who = byId.get(r.paid_by);
      return {
        id: r.id,
        residentId: r.paid_by,
        houseLabel: who?.house_label ?? "—",
        fullName: who?.full_name ?? "Unknown",
        amountNaira: num(r.amount_naira),
        kwhCredited: num(r.kwh_credited),
        pricePerKwh: num(r.price_per_kwh_applied),
        note: r.note,
        receiptPath: r.receipt_path,
        rechargedAt: r.recharged_at,
      };
    }),
    flaggedReadings: readings.map((r) => {
      const who = byId.get(r.resident_id);
      return {
        id: r.id,
        residentId: r.resident_id,
        houseLabel: who?.house_label ?? "—",
        fullName: who?.full_name ?? "Unknown",
        readingKwh: num(r.reading_kwh),
        flagReason: r.flag_reason,
        photoPath: r.photo_path,
        takenAt: r.taken_at,
      };
    }),
  };
}

export interface RecentReading {
  id: string;
  residentId: string;
  houseLabel: string;
  fullName: string;
  readingKwh: number;
  status: ReadingStatus;
  takenAt: string;
}

/** Recent readings (any status) for the corrections screen. */
export async function getRecentReadings(db: DB, limit = 40): Promise<RecentReading[]> {
  const { data, error } = await db
    .from("readings")
    .select("id, resident_id, reading_kwh, status, taken_at")
    .order("taken_at", { ascending: false })
    .limit(limit)
    .returns<
      Pick<ReadingRow, "id" | "resident_id" | "reading_kwh" | "status" | "taken_at">[]
    >();
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const byId = await residentMap(db, [...new Set(rows.map((r) => r.resident_id))]);
  return rows.map((r) => {
    const who = byId.get(r.resident_id);
    return {
      id: r.id,
      residentId: r.resident_id,
      houseLabel: who?.house_label ?? "—",
      fullName: who?.full_name ?? "Unknown",
      readingKwh: num(r.reading_kwh),
      status: r.status,
      takenAt: r.taken_at,
    };
  });
}

export interface AuditEntryView {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
}

/** Audit log with optional entity/action filters (spec §7 admin Audit log). */
export async function getAuditLog(
  db: DB,
  opts: { entity?: string; action?: string; limit?: number } = {},
): Promise<AuditEntryView[]> {
  let q = db
    .from("audit_log")
    .select("id, actor_id, action, entity, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.entity) q = q.eq("entity", opts.entity);
  if (opts.action) q = q.eq("action", opts.action);

  const { data, error } = await q.returns<
    Pick<AuditLogRow, "id" | "actor_id" | "action" | "entity" | "entity_id" | "created_at">[]
  >();
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];
  const byId = await residentMap(db, actorIds);
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_id ? (byId.get(r.actor_id)?.full_name ?? "Unknown") : "System",
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    createdAt: r.created_at,
  }));
}
