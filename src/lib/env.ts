/**
 * Centralised, validated access to environment variables.
 * Public vars are safe in the browser; `serverEnv()` must only be called server-side.
 */

export const publicEnv = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function assertPublicEnv() {
  if (!publicEnv.SUPABASE_URL || !publicEnv.SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.",
    );
  }
}

/** Server-only secrets. Throws if called when the service role key is absent. */
export function serverEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only).");
  }
  return { ...publicEnv, SERVICE_ROLE_KEY: serviceRoleKey };
}
