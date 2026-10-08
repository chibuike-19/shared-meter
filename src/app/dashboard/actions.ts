"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireResident } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitReading } from "@/lib/services/readings";
import { logRecharge } from "@/lib/services/recharges";
import type { ResidentRow } from "@/lib/supabase/types";

function describeError(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join("; ");
  return err instanceof Error ? err.message : "Something went wrong";
}

/**
 * The photo is uploaded to Storage from the browser (to avoid the 1 MB Server
 * Action body limit), so the action receives only its path. Confirm the path
 * sits in the caller's own folder before trusting it.
 */
function validateOwnPath(resident: ResidentRow, path: string): string | null {
  if (!path) return "A photo is required.";
  if (!resident.auth_user_id) return "Your account isn't linked to a login yet.";
  if (!path.startsWith(`${resident.auth_user_id}/`)) return "Invalid photo path.";
  return null;
}

export type SubmitReadingActionResult =
  | { ok: true; outcome: "accepted" | "flagged" | "duplicate"; usedKwh?: number }
  | { ok: false; error: string };

export async function submitReadingAction(
  formData: FormData,
): Promise<SubmitReadingActionResult> {
  try {
    const resident = await requireResident();
    const db = createAdminClient();

    const photoPath = String(formData.get("photoPath") ?? "");
    const pathError = validateOwnPath(resident, photoPath);
    if (pathError) return { ok: false, error: pathError };

    const takenAtRaw = String(formData.get("takenAt") ?? "");
    const result = await submitReading(
      db,
      {
        residentId: resident.id,
        valueKwh: Number(formData.get("valueKwh")),
        takenAt: takenAtRaw ? new Date(takenAtRaw) : undefined,
        source: "web",
        photoPath,
        isAdmin: resident.role === "admin",
      },
      resident.id,
    );

    revalidatePath("/dashboard");
    revalidatePath("/activity");
    if (result.outcome === "duplicate") {
      return { ok: true, outcome: "duplicate" };
    }
    return { ok: true, outcome: result.outcome, usedKwh: result.usedKwh };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export type LogRechargeActionResult =
  | { ok: true; kwhCredited: number; pricePerKwh: number }
  | { ok: false; error: string };

export async function logRechargeAction(
  formData: FormData,
): Promise<LogRechargeActionResult> {
  try {
    const resident = await requireResident();
    const db = createAdminClient();

    const receiptPath = String(formData.get("receiptPath") ?? "");
    const pathError = validateOwnPath(resident, receiptPath);
    if (pathError) return { ok: false, error: pathError };

    const rechargedAtRaw = String(formData.get("rechargedAt") ?? "");
    const recharge = await logRecharge(db, {
      residentId: resident.id,
      amountNaira: Number(formData.get("amountNaira")),
      rechargedAt: rechargedAtRaw ? new Date(rechargedAtRaw) : undefined,
      note: String(formData.get("note") ?? ""),
      source: "web",
      receiptPath,
    });

    revalidatePath("/dashboard");
    revalidatePath("/activity");
    return {
      ok: true,
      kwhCredited: Number(recharge.kwh_credited),
      pricePerKwh: Number(recharge.price_per_kwh_applied),
    };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
