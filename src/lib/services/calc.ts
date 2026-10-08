/**
 * Pure calculation core (spec §4). NO database access, NO framework imports —
 * fully unit-tested and reused by the UI, the service layer and the future
 * WhatsApp bot. All money is naira; all energy is kWh. Balances are in kWh.
 */

/** Round to `dp` decimal places, nudging past binary-float error. */
export function roundTo(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

/**
 * kWh a recharge buys: `amount / price`, locked to 3 dp at recharge time
 * (spec §3.2, §4). A later price change never alters a past credit.
 */
export function kwhFromNaira(amountNaira: number, pricePerKwh: number): number {
  if (pricePerKwh <= 0) throw new Error("pricePerKwh must be > 0");
  return roundTo(amountNaira / pricePerKwh, 3);
}

/** Naira value of a kWh balance at a given price (can be negative). */
export function nairaEquivalent(balanceKwh: number, pricePerKwh: number): number {
  return roundTo(balanceKwh * pricePerKwh, 2);
}

/**
 * consumed_kwh = (latest_accepted_reading − opening_reading) + consumed_offset
 * (spec §4). When a resident has no reading yet, pass latestReading =
 * openingReading so consumption is 0.
 */
export function computeConsumed(input: {
  latestReading: number;
  openingReading: number;
  consumedOffsetKwh?: number;
}): number {
  const { latestReading, openingReading, consumedOffsetKwh = 0 } = input;
  return roundTo(latestReading - openingReading + consumedOffsetKwh, 3);
}

/**
 * credited_kwh = opening_balance + Σ approved recharge.kwh_credited
 *                + Σ adjustments.kwh_delta  (spec §4).
 * Recharge credits are passed already-locked (see `kwhFromNaira`).
 */
export function computeCredited(input: {
  openingBalanceKwh?: number;
  approvedRechargeKwh?: number[];
  adjustmentKwh?: number[];
}): number {
  const {
    openingBalanceKwh = 0,
    approvedRechargeKwh = [],
    adjustmentKwh = [],
  } = input;
  const recharges = approvedRechargeKwh.reduce((a, b) => a + b, 0);
  const adjustments = adjustmentKwh.reduce((a, b) => a + b, 0);
  return roundTo(openingBalanceKwh + recharges + adjustments, 3);
}

export interface BalanceInput {
  openingReading: number;
  latestReading: number;
  openingBalanceKwh?: number;
  consumedOffsetKwh?: number;
  approvedRechargeKwh?: number[];
  adjustmentKwh?: number[];
}

export interface BalanceResult {
  consumedKwh: number;
  creditedKwh: number;
  balanceKwh: number;
}

/** balance_kwh = credited_kwh − consumed_kwh (spec §4). */
export function computeBalance(input: BalanceInput): BalanceResult {
  const consumedKwh = computeConsumed(input);
  const creditedKwh = computeCredited(input);
  return {
    consumedKwh,
    creditedKwh,
    balanceKwh: roundTo(creditedKwh - consumedKwh, 3),
  };
}

/** Σ balances over active residents — should ≈ units left on the shared meter. */
export function groupPoolKwh(balancesKwh: number[]): number {
  return roundTo(
    balancesKwh.reduce((a, b) => a + b, 0),
    3,
  );
}

/**
 * Suggested recharge in naira for a resident who owes (negative balance),
 * rounded UP to the nearest `roundingNaira` (spec §4). Non-negative balances
 * need no recharge → 0.
 */
export function suggestRecharge(
  balanceKwh: number,
  pricePerKwh: number,
  roundingNaira = 100,
): number {
  if (balanceKwh >= 0) return 0;
  const raw = -balanceKwh * pricePerKwh;
  return Math.ceil(raw / roundingNaira) * roundingNaira;
}

export interface RankedResident<T> {
  resident: T;
  balanceKwh: number;
}

/**
 * Order residents by who should recharge next: most negative balance first
 * (spec §4, §7). Stable for equal balances. Returns a new array.
 */
export function rankNextRechargers<T>(
  residents: Array<{ resident: T; balanceKwh: number }>,
): Array<RankedResident<T>> {
  return [...residents].sort((a, b) => a.balanceKwh - b.balanceKwh);
}

export interface PriceRow {
  pricePerKwh: number;
  effectiveFrom: string | Date;
}

/**
 * A reading is "stale" when it is older than `staleDays`, or absent (spec §6).
 * A stale reading understates consumption, so balances get an "as of" caveat.
 */
export function isReadingStale(
  lastReadingAt: string | Date | null,
  staleDays: number,
  now: Date = new Date(),
): boolean {
  if (!lastReadingAt) return true;
  const ageMs = now.getTime() - new Date(lastReadingAt).getTime();
  return ageMs > staleDays * 24 * 60 * 60 * 1000;
}

/**
 * Current price = the row with the greatest effective_from ≤ `at` (spec §6).
 * Returns null if no price is in effect yet.
 */
export function currentPriceAt(rows: PriceRow[], at: Date = new Date()): number | null {
  const atMs = at.getTime();
  let best: { price: number; fromMs: number } | null = null;
  for (const row of rows) {
    const fromMs = new Date(row.effectiveFrom).getTime();
    if (fromMs <= atMs && (best === null || fromMs > best.fromMs)) {
      best = { price: row.pricePerKwh, fromMs };
    }
  }
  return best?.price ?? null;
}
