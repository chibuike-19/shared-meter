"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createResident,
  setResidentActive,
  updateResident,
  replaceMeter,
} from "@/lib/services/residents";

export type ActionResult = { ok: true } | { ok: false; error: string };

function describeError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => i.message).join("; ");
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

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
