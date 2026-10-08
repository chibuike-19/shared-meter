import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Append an entry to the audit log. Every privileged admin action must call
 * this (spec §5, §13). Uses the client passed in (normally the service-role
 * admin client) so it is written atomically with the operation it records.
 */
export async function writeAudit(db: DB, entry: AuditEntry): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
  });
  if (error) throw new Error(`audit_log write failed: ${error.message}`);
}
