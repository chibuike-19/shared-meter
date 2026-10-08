import { createBrowserClient } from "@supabase/ssr";
import { assertPublicEnv, publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/** Browser Supabase client, bound to the signed-in resident via cookies. */
export function createClient() {
  assertPublicEnv();
  return createBrowserClient<Database>(
    publicEnv.SUPABASE_URL,
    publicEnv.SUPABASE_ANON_KEY,
  );
}
