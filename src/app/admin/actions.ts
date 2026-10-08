"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveRecharge, rejectRecharge } from "@/lib/services/recharges";
import { acceptReading, rejectReading } from "@/lib/services/readings";
import { setPrice } from "@/lib/services/pricing";
import { addAdjustment } from "@/lib/services/adjustments";
import { updateSetting } from "@/lib/services/settings";
import { getSubmissionById, type Submission } from "@/lib/services/submissions";

export type ActionResult = { ok: true } | { ok: false; error: string };

function describeError(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join("; ");
  return err instanceof Error ? err.message : "Something went wrong";
}

function revalidateAll() {
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/corrections");
  revalidatePath("/admin/audit");
  revalidatePath("/group");
  revalidatePath("/dashboard");
  revalidatePath("/activity");
}

export async function approveRechargeAction(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await approveRecharge(createAdminClient(), id, admin.id);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function rejectRechargeAction(id: string, reason: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (!reason.trim()) return { ok: false, error: "A reason is required." };
    await rejectRecharge(createAdminClient(), id, admin.id, reason.trim());
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function acceptReadingAction(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await acceptReading(createAdminClient(), id, admin.id);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function rejectReadingAction(id: string, reason?: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await rejectReading(createAdminClient(), id, admin.id, reason?.trim() || undefined);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function setPriceAction(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const effRaw = String(formData.get("effectiveFrom") ?? "");
    await setPrice(
      createAdminClient(),
      {
        pricePerKwh: Number(formData.get("pricePerKwh")),
        effectiveFrom: effRaw ? new Date(effRaw) : new Date(),
      },
      admin.id,
    );
    revalidatePath("/admin/price");
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function addAdjustmentAction(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await addAdjustment(
      createAdminClient(),
      {
        residentId: String(formData.get("residentId") ?? ""),
        kwhDelta: Number(formData.get("kwhDelta")),
        reason: String(formData.get("reason") ?? ""),
      },
      admin.id,
    );
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export type ItemDetailResult =
  | { ok: true; submission: Submission | null }
  | { ok: false; error: string };

/** Fetch full detail of a reading/recharge for the audit-log side panel. */
export async function auditItemDetailAction(
  kind: "reading" | "recharge",
  id: string,
): Promise<ItemDetailResult> {
  try {
    await requireAdmin();
    const submission = await getSubmissionById(createAdminClient(), kind, id);
    return { ok: true, submission };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function updateSettingAction(key: string, value: number): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await updateSetting(
      createAdminClient(),
      { key: key as "stale_days" | "jump_threshold_kwh_per_day" | "rounding_naira", value },
      admin.id,
    );
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
