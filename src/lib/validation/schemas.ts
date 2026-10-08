import { z } from "zod";

/** E.164 phone, e.g. +2348012345678. Optional/empty allowed. */
export const phoneE164 = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format, e.g. +2348012345678")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** kWh reading: non-negative, at most 2 decimals. */
export const readingKwh = z
  .number()
  .nonnegative("Reading cannot be negative")
  .refine((n) => Number.isFinite(n) && Math.round(n * 100) === n * 100, {
    message: "At most 2 decimal places",
  });

export const createResidentSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  houseLabel: z.string().trim().min(1, "House label is required"),
  email: z.string().trim().email("A valid email is required"),
  phoneE164,
  role: z.enum(["admin", "resident"]).default("resident"),
  meterSerial: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  openingReading: readingKwh,
  openingBalanceKwh: z.number().default(0),
});
export type CreateResidentInput = z.infer<typeof createResidentSchema>;

export const updateResidentSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(1).optional(),
  houseLabel: z.string().trim().min(1).optional(),
  phoneE164,
  role: z.enum(["admin", "resident"]).optional(),
  meterSerial: z.string().trim().optional(),
  openingReading: readingKwh.optional(),
  openingBalanceKwh: z.number().optional(),
});
export type UpdateResidentInput = z.infer<typeof updateResidentSchema>;

export const setActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export const source = z.enum(["web", "whatsapp", "opening", "admin"]).default("web");

export const submitReadingSchema = z.object({
  residentId: z.string().uuid(),
  valueKwh: readingKwh,
  takenAt: z.coerce.date().optional(),
  source,
});
export type SubmitReadingInput = z.infer<typeof submitReadingSchema>;

export const logRechargeSchema = z.object({
  residentId: z.string().uuid(),
  amountNaira: z
    .number()
    .positive("Amount must be greater than zero")
    .refine((n) => Math.round(n * 100) === n * 100, "At most 2 decimal places (kobo)"),
  rechargedAt: z.coerce.date().optional(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  source,
});
export type LogRechargeInput = z.infer<typeof logRechargeSchema>;

// --- admin operations (spec §6, §8) ----------------------------------------

export const rejectSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});

export const setPriceSchema = z.object({
  pricePerKwh: z.number().positive("Price must be greater than zero"),
  effectiveFrom: z.coerce.date(),
});
export type SetPriceInput = z.infer<typeof setPriceSchema>;

export const addAdjustmentSchema = z.object({
  residentId: z.string().uuid(),
  kwhDelta: z
    .number()
    .refine((n) => n !== 0, "Adjustment can't be zero"),
  reason: z.string().trim().min(1, "A reason is required"),
});
export type AddAdjustmentInput = z.infer<typeof addAdjustmentSchema>;

export const replaceMeterSchema = z.object({
  residentId: z.string().uuid(),
  oldFinalReading: readingKwh,
  newStartReading: readingKwh,
});
export type ReplaceMeterInput = z.infer<typeof replaceMeterSchema>;

export const updateSettingSchema = z.object({
  key: z.enum(["stale_days", "jump_threshold_kwh_per_day", "rounding_naira"]),
  value: z.number().positive("Must be greater than zero"),
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
