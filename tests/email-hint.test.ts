import { describe, expect, it } from "vitest";
import { suggestEmailFix } from "@/lib/email-hint";

describe("suggestEmailFix", () => {
  it("fixes a misspelled gmail domain", () => {
    expect(suggestEmailFix("ada@gmsil.com")).toBe("ada@gmail.com");
    expect(suggestEmailFix("ada@gmail.con")).toBe("ada@gmail.com");
    expect(suggestEmailFix("ada@gmail.co")).toBe("ada@gmail.com");
  });

  it("fixes other common providers", () => {
    expect(suggestEmailFix("bo@yahooo.com")).toBe("bo@yahoo.com");
    expect(suggestEmailFix("cy@hotmial.com")).toBe("cy@hotmail.com");
    expect(suggestEmailFix("di@outlok.com")).toBe("di@outlook.com");
  });

  it("returns null for a correct common domain", () => {
    expect(suggestEmailFix("ada@gmail.com")).toBeNull();
    expect(suggestEmailFix("ada@icloud.com")).toBeNull();
  });

  it("returns null for an unrelated custom domain", () => {
    expect(suggestEmailFix("ada@acme.com")).toBeNull();
    expect(suggestEmailFix("staff@meterco.ng")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(suggestEmailFix("not-an-email")).toBeNull();
    expect(suggestEmailFix("ada@")).toBeNull();
    expect(suggestEmailFix("@gmail.com")).toBeNull();
  });

  it("keeps the local part as typed", () => {
    expect(suggestEmailFix("First.Last@gmsil.com")).toBe("First.Last@gmail.com");
  });
});
