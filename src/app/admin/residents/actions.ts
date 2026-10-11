"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createResident,
  setResidentActive,
  updateResident,
  replaceMeter,
  deleteResident,
} from "@/lib/services/residents";
import { submitReading } from "@/lib/services/readings";
import { logRecharge } from "@/lib/services/recharges";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateBalances() {
  revalidatePath("/admin/residents");
  revalidatePath("/group");
  revalidatePath("/dashboard");
  revalidatePath("/activity");
}

const describeError = friendlyError;

export async function createResidentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const db = createAdminClient();
    await createResident(
      db,
      {
        fullName: String(formData.get("fullName") ?? ""),
        houseLabel: String(formData.get("houseLabel") ?? ""),
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        phoneE164: String(formData.get("phoneE164") ?? ""),
        role: formData.get("role") === "admin" ? "admin" : "resident",
        meterSerial: String(formData.get("meterSerial") ?? ""),
        openingReading: Number(formData.get("openingReading") ?? 0),
        openingBalanceKwh: Number(formData.get("openingBalanceKwh") ?? 0),
      },
      admin.id,
    );
    revalidatePath("/admin/residents");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function updateResidentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const db = createAdminClient();
    const openingReadingRaw = String(formData.get("openingReading") ?? "");
    const openingBalanceRaw = String(formData.get("openingBalanceKwh") ?? "");
    await updateResident(
      db,
      {
        id: String(formData.get("id") ?? ""),
        fullName: String(formData.get("fullName") ?? ""),
        houseLabel: String(formData.get("houseLabel") ?? ""),
        phoneE164: String(formData.get("phoneE164") ?? ""),
        role: formData.get("role") === "admin" ? "admin" : "resident",
        meterSerial: String(formData.get("meterSerial") ?? ""),
        openingReading: openingReadingRaw ? Number(openingReadingRaw) : undefined,
        openingBalanceKwh: openingBalanceRaw ? Number(openingBalanceRaw) : undefined,
      },
      admin.id,
    );
    revalidatePath("/admin/residents");
    revalidatePath("/group");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function setResidentActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const db = createAdminClient();
    await setResidentActive(db, { id, isActive }, admin.id);
    revalidatePath("/admin/residents");
    revalidatePath("/group");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export type SubmitForResidentResult =
  | { ok: true; outcome: "accepted" | "flagged" | "duplicate"; usedKwh?: number }
  | { ok: false; error: string };

/** Admin submits a reading on behalf of a resident (photo optional, trusted). */
export async function adminSubmitReadingAction(
  formData: FormData,
): Promise<SubmitForResidentResult> {
  try {
    const admin = await requireAdmin();
    const db = createAdminClient();
    const takenAtRaw = String(formData.get("takenAt") ?? "");
    const photoPath = String(formData.get("photoPath") ?? "");
    const result = await submitReading(
      db,
      {
        residentId: String(formData.get("residentId") ?? ""),
        valueKwh: Number(formData.get("valueKwh")),
        takenAt: takenAtRaw ? new Date(takenAtRaw) : undefined,
        source: "admin",
        photoPath: photoPath || undefined,
        isAdmin: true,
      },
      admin.id,
    );
    revalidateBalances();
    revalidatePath("/history");
    if (result.outcome === "duplicate") return { ok: true, outcome: "duplicate" };
    return { ok: true, outcome: result.outcome, usedKwh: result.usedKwh };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export type AdminRechargeResult =
  | { ok: true; kwhCredited: number; pricePerKwh: number }
  | { ok: false; error: string };

/** Admin logs a recharge on behalf of a resident (photo optional). */
export async function adminLogRechargeAction(
  formData: FormData,
): Promise<AdminRechargeResult> {
  try {
    await requireAdmin();
    const db = createAdminClient();
    const rechargedAtRaw = String(formData.get("rechargedAt") ?? "");
    const receiptPath = String(formData.get("receiptPath") ?? "");
    const recharge = await logRecharge(db, {
      residentId: String(formData.get("residentId") ?? ""),
      amountNaira: Number(formData.get("amountNaira")),
      rechargedAt: rechargedAtRaw ? new Date(rechargedAtRaw) : undefined,
      note: String(formData.get("note") ?? ""),
      source: "admin",
      receiptPath: receiptPath || undefined,
    });
    revalidateBalances();
    revalidatePath("/history");
    return {
      ok: true,
      kwhCredited: Number(recharge.kwh_credited),
      pricePerKwh: Number(recharge.price_per_kwh_applied),
    };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function deleteResidentAction(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (id === admin.id) {
      return { ok: false, error: "You can't delete your own account." };
    }
    await deleteResident(createAdminClient(), id, admin.id);
    revalidateBalances();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function replaceMeterAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const db = createAdminClient();
    await replaceMeter(
      db,
      {
        residentId: String(formData.get("residentId") ?? ""),
        oldFinalReading: Number(formData.get("oldFinalReading")),
        newStartReading: Number(formData.get("newStartReading")),
      },
      admin.id,
    );
    revalidatePath("/admin/residents");
    revalidatePath("/group");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
