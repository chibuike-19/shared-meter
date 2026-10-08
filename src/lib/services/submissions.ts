import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ReadingRow,
  RechargeRow,
  ResidentRow,
  AuditLogRow,
  ReadingStatus,
  RechargeStatus,
} from "@/lib/supabase/types";
import { signedProofUrl } from "@/lib/services/storage";

type DB = SupabaseClient<Database>;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const DECISION_ACTIONS = [
  "reading.accept",
  "reading.reject",
  "recharge.approve",
  "recharge.reject",
];

function decisionLabel(action: string): string {
  if (action.endsWith(".accept")) return "Accepted";
  if (action.endsWith(".approve")) return "Approved";
  if (action.endsWith(".reject")) return "Rejected";
  return action;
}

export interface Submission {
  kind: "reading" | "recharge";
  id: string;
  status: ReadingStatus | RechargeStatus;
  occurredAt: string; // taken_at / recharged_at
  createdAt: string;
  source: string;
  initiatorName: string;
  reason: string | null; // flag_reason / reject_reason
  decidedByName: string | null;
  decidedAt: string | null;
  decisionLabel: string | null;
  proofViewUrl: string | null;
  proofDownloadUrl: string | null;
  // reading
  readingKwh?: number;
  // recharge
  amountNaira?: number;
  kwhCredited?: number;
  pricePerKwh?: number;
  note?: string | null;
}

/**
 * A resident's full submission history — readings and recharges in every status
 * (spec: transparency over their own records). Scoped strictly to `residentId`;
 * pass the service-role client (the page authorizes the caller first), since it
 * reads audit_log for decision info and signs the resident's own private proofs.
 */
export async function getSubmissionHistory(
  db: DB,
  residentId: string,
): Promise<Submission[]> {
  const [readingsRes, rechargesRes] = await Promise.all([
    db
      .from("readings")
      .select("id, reading_kwh, taken_at, status, flag_reason, photo_path, source, submitted_by, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .returns<
        Pick<
          ReadingRow,
          | "id" | "reading_kwh" | "taken_at" | "status" | "flag_reason"
          | "photo_path" | "source" | "submitted_by" | "created_at"
        >[]
      >(),
    db
      .from("recharges")
      .select("id, amount_naira, kwh_credited, price_per_kwh_applied, status, reject_reason, note, receipt_path, source, recharged_at, created_at")
      .eq("paid_by", residentId)
      .order("created_at", { ascending: false })
      .returns<
        Pick<
          RechargeRow,
          | "id" | "amount_naira" | "kwh_credited" | "price_per_kwh_applied" | "status"
          | "reject_reason" | "note" | "receipt_path" | "source" | "recharged_at" | "created_at"
        >[]
      >(),
  ]);
  if (readingsRes.error) throw new Error(readingsRes.error.message);
  if (rechargesRes.error) throw new Error(rechargesRes.error.message);

  const readings = readingsRes.data ?? [];
  const recharges = rechargesRes.data ?? [];
  const ids = [...readings.map((r) => r.id), ...recharges.map((r) => r.id)];

  // Decision info (who accepted/approved/rejected and when) from the audit log.
  const decisionByEntity = new Map<string, { actorId: string | null; at: string; action: string }>();
  if (ids.length) {
    const { data: audits, error } = await db
      .from("audit_log")
      .select("actor_id, action, entity_id, created_at")
      .in("entity_id", ids)
      .in("action", DECISION_ACTIONS)
      .order("created_at", { ascending: true })
      .returns<Pick<AuditLogRow, "actor_id" | "action" | "entity_id" | "created_at">[]>();
    if (error) throw new Error(error.message);
    for (const a of audits ?? []) {
      if (a.entity_id) {
        // ascending order → last write wins = most recent decision
        decisionByEntity.set(a.entity_id, {
          actorId: a.actor_id,
          at: a.created_at,
          action: a.action,
        });
      }
    }
  }

  // Resolve names for initiators + deciders.
  const nameIds = new Set<string>();
  readings.forEach((r) => r.submitted_by && nameIds.add(r.submitted_by));
  recharges.forEach(() => nameIds.add(residentId));
  decisionByEntity.forEach((d) => d.actorId && nameIds.add(d.actorId));
  nameIds.add(residentId);

  const { data: residentsData, error: nameErr } = await db
    .from("residents")
    .select("id, full_name")
    .in("id", [...nameIds])
    .returns<Pick<ResidentRow, "id" | "full_name">[]>();
  if (nameErr) throw new Error(nameErr.message);
  const nameOf = new Map((residentsData ?? []).map((r) => [r.id, r.full_name]));

  const ext = (path: string) => path.split(".").pop() || "jpg";

  async function proofUrls(path: string | null, kind: string, id: string) {
    if (!path) return { view: null, download: null };
    const [view, download] = await Promise.all([
      signedProofUrl(db, path, 3600),
      signedProofUrl(db, path, 3600, `${kind}-${id.slice(0, 8)}.${ext(path)}`),
    ]);
    return { view, download };
  }

  const readingSubs: Submission[] = await Promise.all(
    readings.map(async (r) => {
      const d = decisionByEntity.get(r.id);
      const urls = await proofUrls(r.photo_path, "reading", r.id);
      return {
        kind: "reading" as const,
        id: r.id,
        status: r.status,
        occurredAt: r.taken_at,
        createdAt: r.created_at,
        source: r.source,
        initiatorName: (r.submitted_by && nameOf.get(r.submitted_by)) || "—",
        reason: r.flag_reason,
        decidedByName: d?.actorId ? (nameOf.get(d.actorId) ?? "Unknown") : null,
        decidedAt: d?.at ?? null,
        decisionLabel: d ? decisionLabel(d.action) : null,
        proofViewUrl: urls.view,
        proofDownloadUrl: urls.download,
        readingKwh: num(r.reading_kwh),
      };
    }),
  );

  const rechargeSubs: Submission[] = await Promise.all(
    recharges.map(async (r) => {
      const d = decisionByEntity.get(r.id);
      const urls = await proofUrls(r.receipt_path, "recharge", r.id);
      return {
        kind: "recharge" as const,
        id: r.id,
        status: r.status,
        occurredAt: r.recharged_at,
        createdAt: r.created_at,
        source: r.source,
        initiatorName: nameOf.get(residentId) ?? "—",
        reason: r.reject_reason,
        decidedByName: d?.actorId ? (nameOf.get(d.actorId) ?? "Unknown") : null,
        decidedAt: d?.at ?? null,
        decisionLabel: d ? decisionLabel(d.action) : null,
        proofViewUrl: urls.view,
        proofDownloadUrl: urls.download,
        amountNaira: num(r.amount_naira),
        kwhCredited: num(r.kwh_credited),
        pricePerKwh: num(r.price_per_kwh_applied),
        note: r.note,
      };
    }),
  );

  return [...readingSubs, ...rechargeSubs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Full detail of a single reading or recharge by id — for the admin audit-log
 * side panel. Resolves initiator + decider (from audit_log) and signs the
 * private proof. Pass the service-role client (admin-only context). Returns
 * null if the item doesn't exist.
 */
export async function getSubmissionById(
  db: DB,
  kind: "reading" | "recharge",
  id: string,
): Promise<Submission | null> {
  if (kind === "reading") {
    const { data: r, error } = await db
      .from("readings")
      .select("resident_id, submitted_by, reading_kwh, taken_at, status, flag_reason, photo_path, source, created_at")
      .eq("id", id)
      .maybeSingle<
        Pick<
          ReadingRow,
          | "resident_id" | "submitted_by" | "reading_kwh" | "taken_at" | "status"
          | "flag_reason" | "photo_path" | "source" | "created_at"
        >
      >();
    if (error) throw new Error(error.message);
    if (!r) return null;
    const list = await getSubmissionHistory(db, r.resident_id);
    return list.find((s) => s.kind === "reading" && s.id === id) ?? null;
  }

  const { data: r, error } = await db
    .from("recharges")
    .select("paid_by")
    .eq("id", id)
    .maybeSingle<Pick<RechargeRow, "paid_by">>();
  if (error) throw new Error(error.message);
  if (!r) return null;
  const list = await getSubmissionHistory(db, r.paid_by);
  return list.find((s) => s.kind === "recharge" && s.id === id) ?? null;
}

/** Count of the resident's rejected submissions (for a dashboard nudge). */
export async function countRejectedSubmissions(db: DB, residentId: string): Promise<number> {
  const [readings, recharges] = await Promise.all([
    db
      .from("readings")
      .select("id", { count: "exact", head: true })
      .eq("resident_id", residentId)
      .eq("status", "rejected"),
    db
      .from("recharges")
      .select("id", { count: "exact", head: true })
      .eq("paid_by", residentId)
      .eq("status", "rejected"),
  ]);
  return (readings.count ?? 0) + (recharges.count ?? 0);
}
