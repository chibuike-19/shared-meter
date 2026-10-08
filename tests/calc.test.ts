import { describe, expect, it } from "vitest";
import {
  computeBalance,
  computeConsumed,
  computeCredited,
  currentPriceAt,
  groupPoolKwh,
  isReadingStale,
  kwhFromNaira,
  nairaEquivalent,
  rankNextRechargers,
  roundTo,
  suggestRecharge,
} from "@/lib/services/calc";

describe("roundTo", () => {
  it("rounds to the given decimal places", () => {
    expect(roundTo(1.23456, 3)).toBe(1.235);
    expect(roundTo(200, 3)).toBe(200);
    expect(roundTo(-55.0004, 3)).toBe(-55);
  });
});

describe("kwhFromNaira", () => {
  it("locks credit at amount / price, 3 dp", () => {
    expect(kwhFromNaira(40000, 200)).toBe(200);
    expect(kwhFromNaira(22000, 220)).toBe(100);
    expect(kwhFromNaira(11000, 200)).toBe(55);
    expect(kwhFromNaira(1000, 300)).toBe(3.333);
  });
  it("rejects non-positive prices", () => {
    expect(() => kwhFromNaira(1000, 0)).toThrow();
  });
});

describe("computeConsumed", () => {
  it("is latest − opening + offset", () => {
    expect(computeConsumed({ latestReading: 1300, openingReading: 1240 })).toBe(60);
    expect(
      computeConsumed({ latestReading: 1300, openingReading: 1240, consumedOffsetKwh: 500 }),
    ).toBe(560);
  });
  it("is zero when no reading beyond opening", () => {
    expect(computeConsumed({ latestReading: 1240, openingReading: 1240 })).toBe(0);
  });
});

describe("computeCredited", () => {
  it("sums opening balance, recharges and adjustments", () => {
    expect(
      computeCredited({
        openingBalanceKwh: 10,
        approvedRechargeKwh: [200, 100],
        adjustmentKwh: [-5, 2],
      }),
    ).toBe(307);
  });
});

describe("nairaEquivalent", () => {
  it("multiplies balance by price", () => {
    expect(nairaEquivalent(140, 200)).toBe(28000);
    expect(nairaEquivalent(-55, 200)).toBe(-11000);
  });
});

describe("suggestRecharge", () => {
  it("rounds owed amount up to the nearest 100", () => {
    expect(suggestRecharge(-55, 200)).toBe(11000); // C in the worked example
    expect(suggestRecharge(-50, 200)).toBe(10000);
    expect(suggestRecharge(-35, 200)).toBe(7000);
    expect(suggestRecharge(-0.004, 200)).toBe(100); // tiny debt still rounds up
  });
  it("suggests nothing for non-negative balances", () => {
    expect(suggestRecharge(0, 200)).toBe(0);
    expect(suggestRecharge(140, 200)).toBe(0);
  });
});

describe("isReadingStale", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("is fresh within the window", () => {
    expect(isReadingStale("2026-10-05T12:00:00Z", 7, now)).toBe(false);
  });
  it("is stale beyond the window", () => {
    expect(isReadingStale("2026-09-20T12:00:00Z", 7, now)).toBe(true);
  });
  it("treats a missing reading as stale", () => {
    expect(isReadingStale(null, 7, now)).toBe(true);
  });
});

describe("currentPriceAt", () => {
  const rows = [
    { pricePerKwh: 200, effectiveFrom: "2026-01-01T00:00:00Z" },
    { pricePerKwh: 220, effectiveFrom: "2026-06-01T00:00:00Z" },
  ];
  it("picks the greatest effective_from ≤ at", () => {
    expect(currentPriceAt(rows, new Date("2026-03-01T00:00:00Z"))).toBe(200);
    expect(currentPriceAt(rows, new Date("2026-07-01T00:00:00Z"))).toBe(220);
  });
  it("returns null before any price is in effect", () => {
    expect(currentPriceAt(rows, new Date("2025-12-31T00:00:00Z"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The spec's primary acceptance test (§4 worked example + §12 Phase 2).
// ---------------------------------------------------------------------------
describe("worked example (spec §4)", () => {
  const PRICE = 200;

  // A recharges ₦40,000 (approved) → +200 kWh. Others have no recharge yet.
  const residents = {
    A: computeBalance({
      openingReading: 1240,
      latestReading: 1300,
      approvedRechargeKwh: [kwhFromNaira(40000, PRICE)],
    }),
    B: computeBalance({ openingReading: 980, latestReading: 1030 }),
    C: computeBalance({ openingReading: 1550, latestReading: 1605 }),
    D: computeBalance({ openingReading: 760, latestReading: 795 }),
  };

  it("consumes 60 / 50 / 55 / 35 kWh", () => {
    expect(residents.A.consumedKwh).toBe(60);
    expect(residents.B.consumedKwh).toBe(50);
    expect(residents.C.consumedKwh).toBe(55);
    expect(residents.D.consumedKwh).toBe(35);
  });

  it("yields balances A +140, B −50, C −55, D −35", () => {
    expect(residents.A.balanceKwh).toBe(140);
    expect(residents.B.balanceKwh).toBe(-50);
    expect(residents.C.balanceKwh).toBe(-55);
    expect(residents.D.balanceKwh).toBe(-35);
  });

  it("has a group pool of 0", () => {
    expect(
      groupPoolKwh([
        residents.A.balanceKwh,
        residents.B.balanceKwh,
        residents.C.balanceKwh,
        residents.D.balanceKwh,
      ]),
    ).toBe(0);
  });

  it("suggests C recharges next, ₦11,000", () => {
    const ranked = rankNextRechargers([
      { resident: "A", balanceKwh: residents.A.balanceKwh },
      { resident: "B", balanceKwh: residents.B.balanceKwh },
      { resident: "C", balanceKwh: residents.C.balanceKwh },
      { resident: "D", balanceKwh: residents.D.balanceKwh },
    ]);
    expect(ranked[0].resident).toBe("C");
    expect(ranked[0].balanceKwh).toBe(-55);
    expect(suggestRecharge(ranked[0].balanceKwh, PRICE)).toBe(11000);
  });
});

// ---------------------------------------------------------------------------
// Price-change scenario (spec §4): price → ₦220; B recharges ₦22,000 → +100 kWh.
// A's earlier 200 kWh credit must stay 200. B's balance becomes +50.
// ---------------------------------------------------------------------------
describe("price-change scenario (spec §4)", () => {
  it("credits B 100 kWh at the new price, leaving A's 200 untouched", () => {
    // A's credit was locked at the OLD price when A recharged.
    const aCredit = kwhFromNaira(40000, 200);
    expect(aCredit).toBe(200);

    // B recharges after the price rises to ₦220.
    const bCredit = kwhFromNaira(22000, 220);
    expect(bCredit).toBe(100);

    const b = computeBalance({
      openingReading: 980,
      latestReading: 1030, // still consumed 50
      approvedRechargeKwh: [bCredit],
    });
    expect(b.balanceKwh).toBe(50); // −50 + 100

    // A re-evaluated at the new price keeps its locked 200 kWh credit.
    const a = computeBalance({
      openingReading: 1240,
      latestReading: 1300,
      approvedRechargeKwh: [aCredit],
    });
    expect(a.creditedKwh).toBe(200);
    expect(a.balanceKwh).toBe(140);
  });
});
