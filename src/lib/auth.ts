import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getResidentByAuthUser } from "@/lib/services/residents";
import type { ResidentRow } from "@/lib/supabase/types";

/** The signed-in Supabase auth user, or null. Server-side only. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The resident profile for the signed-in user, or null. */
export async function getCurrentResident(): Promise<ResidentRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return getResidentByAuthUser(supabase, user.id);
}

/** Require a signed-in, active resident. Redirects otherwise. */
export async function requireResident(): Promise<ResidentRow> {
  const resident = await getCurrentResident();
  if (!resident) redirect("/login");
  if (!resident.is_active) redirect("/login?error=inactive");
  return resident;
}

/** Require an admin. Redirects non-admins to their dashboard. */
export async function requireAdmin(): Promise<ResidentRow> {
  const resident = await requireResident();
  if (resident.role !== "admin") redirect("/dashboard");
  return resident;
}
