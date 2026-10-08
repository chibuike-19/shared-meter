import { describe, expect, it } from "vitest";
import { createResidentSchema } from "@/lib/validation/schemas";

// Smoke test: confirms the Vitest harness and the "@/" path alias resolve.
// The real calculation-core tests arrive in Phase 2.
describe("createResidentSchema", () => {
  it("accepts a valid resident", () => {
    const parsed = createResidentSchema.parse({
      fullName: "Ada Lovelace",
      houseLabel: "House A",
      email: "ada@example.com",
      openingReading: 1240,
    });
    expect(parsed.role).toBe("resident");
    expect(parsed.openingReading).toBe(1240);
  });

  it("rejects a reading with more than 2 decimals", () => {
    expect(() =>
      createResidentSchema.parse({
        fullName: "Bo",
        houseLabel: "House B",
        email: "bo@example.com",
        openingReading: 10.123,
      }),
    ).toThrow();
  });

  it("rejects a bad email", () => {
    expect(() =>
      createResidentSchema.parse({
        fullName: "Cy",
        houseLabel: "House C",
        email: "not-an-email",
        openingReading: 5,
      }),
    ).toThrow();
  });
});
