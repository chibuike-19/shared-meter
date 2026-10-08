import { describe, expect, it } from "vitest";
import { decideReading, type LastReading } from "@/lib/services/reading-rules";

const now = new Date("2026-10-07T12:00:00Z");
const dayAgo = new Date("2026-10-06T12:00:00Z");

function last(readingKwh: number, takenAt = dayAgo, createdAt = dayAgo): LastReading {
  return { readingKwh, takenAt, createdAt };
}

const base = {
  now,
  jumpThresholdPerDay: 40,
  isAdmin: false,
  takenAt: now,
};

describe("decideReading", () => {
  it("rejects a reading lower than the last accepted one", () => {
    const d = decideReading({ ...base, valueKwh: 950, lastAccepted: last(1000) });
    expect(d.action).toBe("reject");
    if (d.action === "reject") expect(d.reason).toContain("1000");
  });

  it("accepts a normal reading within the jump threshold", () => {
    // 30 kWh over ~1 day, threshold 40 → accepted
    const d = decideReading({ ...base, valueKwh: 1030, lastAccepted: last(1000) });
    expect(d).toEqual({ action: "insert", status: "accepted", usedKwh: 30 });
  });

  it("flags an implausible jump", () => {
    // 100 kWh over ~1 day, threshold 40 → flagged
    const d = decideReading({ ...base, valueKwh: 1100, lastAccepted: last(1000) });
    expect(d.action).toBe("insert");
    if (d.action === "insert") {
      expect(d.status).toBe("flagged");
      expect(d.usedKwh).toBe(100);
      expect(d.flagReason).toBeTruthy();
    }
  });

  it("ignores an identical value submitted within 1 minute", () => {
    const recent = new Date(now.getTime() - 30 * 1000); // 30s ago
    const d = decideReading({
      ...base,
      valueKwh: 1000,
      lastAccepted: last(1000, recent, recent),
    });
    expect(d.action).toBe("duplicate");
  });

  it("accepts an identical value submitted after the duplicate window (0 usage)", () => {
    const d = decideReading({ ...base, valueKwh: 1000, lastAccepted: last(1000) });
    expect(d).toEqual({ action: "insert", status: "accepted", usedKwh: 0 });
  });

  it("rejects back-dating more than 48 hours for residents", () => {
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const d = decideReading({
      ...base,
      takenAt: threeDaysAgo,
      valueKwh: 1010,
      lastAccepted: last(1000, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z")),
    });
    expect(d.action).toBe("reject");
    if (d.action === "reject") expect(d.reason).toContain("48 hours");
  });

  it("lets an admin set any time", () => {
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const d = decideReading({
      ...base,
      isAdmin: true,
      takenAt: threeDaysAgo,
      valueKwh: 1010,
      lastAccepted: last(1000, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z")),
    });
    expect(d.action).toBe("insert");
  });

  it("rejects a future reading for residents", () => {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const d = decideReading({ ...base, takenAt: tomorrow, valueKwh: 1010, lastAccepted: last(1000) });
    expect(d.action).toBe("reject");
    if (d.action === "reject") expect(d.reason).toContain("future");
  });
});
