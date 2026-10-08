/**
 * Pure reading-submission rules (spec §6). NO database or framework imports —
 * unit-tested and reused by the web app and the future WhatsApp bot. The DB
 * service (`submitReading`) loads the inputs and applies the decision.
 */
import { roundTo } from "@/lib/services/calc";

export const BACKDATE_LIMIT_MS = 48 * 60 * 60 * 1000; // 48 hours
export const DUPLICATE_WINDOW_MS = 60 * 1000; // 1 minute
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface LastReading {
  readingKwh: number;
  takenAt: string | Date;
  createdAt: string | Date;
}

export interface DecideReadingInput {
  valueKwh: number;
  /** Most recent accepted reading (the opening reading always exists). */
  lastAccepted: LastReading;
  takenAt: Date;
  now: Date;
  jumpThresholdPerDay: number;
  isAdmin: boolean;
}

export type ReadingDecision =
  | { action: "reject"; reason: string }
  | { action: "duplicate" }
  | {
      action: "insert";
      status: "accepted" | "flagged";
      usedKwh: number;
      flagReason?: string;
    };

/** Decide what to do with a submitted reading (spec §6 "Submitting a reading"). */
export function decideReading(input: DecideReadingInput): ReadingDecision {
  const { valueKwh, lastAccepted, takenAt, now, jumpThresholdPerDay, isAdmin } =
    input;

  const takenMs = takenAt.getTime();
  const nowMs = now.getTime();
  const lastTakenMs = new Date(lastAccepted.takenAt).getTime();
  const lastCreatedMs = new Date(lastAccepted.createdAt).getTime();

  // Residents may back-date at most 48h and not into the future; admins: any time.
  if (!isAdmin) {
    if (takenMs > nowMs + DUPLICATE_WINDOW_MS) {
      return { action: "reject", reason: "A reading can't be in the future." };
    }
    if (nowMs - takenMs > BACKDATE_LIMIT_MS) {
      return {
        action: "reject",
        reason: "You can only back-date a reading up to 48 hours.",
      };
    }
  }

  // Lower than the last accepted reading → rejected with a clear message.
  if (valueKwh < lastAccepted.readingKwh) {
    return {
      action: "reject",
      reason: `Your last reading was ${lastAccepted.readingKwh}. A new reading must be the same or higher.`,
    };
  }

  // Identical value submitted within 1 minute → ignore the duplicate.
  if (
    valueKwh === lastAccepted.readingKwh &&
    nowMs - lastCreatedMs < DUPLICATE_WINDOW_MS
  ) {
    return { action: "duplicate" };
  }

  const usedKwh = roundTo(valueKwh - lastAccepted.readingKwh, 3);

  // Implausible jump → flagged, excluded from balances until an admin accepts.
  const elapsedDays = Math.max((takenMs - lastTakenMs) / MS_PER_DAY, 0);
  const threshold = jumpThresholdPerDay * elapsedDays;
  if (usedKwh > threshold) {
    return {
      action: "insert",
      status: "flagged",
      usedKwh,
      flagReason: `Jump of ${usedKwh} kWh over ${roundTo(
        elapsedDays,
        2,
      )} day(s) exceeds the ${jumpThresholdPerDay} kWh/day threshold.`,
    };
  }

  return { action: "insert", status: "accepted", usedKwh };
}
