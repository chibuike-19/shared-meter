import "@/lib/supabase/ws-polyfill";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role client that bypasses RLS. SERVER ONLY.
 * Used by the service layer for privileged operations (creating residents,
 * approving recharges, writing the audit log) that run on behalf of an admin
 * after the caller's permissions have already been checked.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createSupabaseClient<Database>(env.SUPABASE_URL, env.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
