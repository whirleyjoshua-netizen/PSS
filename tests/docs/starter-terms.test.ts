import { describe, expect, it } from "vitest";
import { TERMS_FIELDS, markerPattern } from "@/lib/docs/fields";
import { STARTER_TERMS, STARTER_TERMS_NAME } from "@/lib/docs/starter-terms";

describe("starter terms", () => {
  it("is named Contract terms", () => expect(STARTER_TERMS_NAME).toBe("Contract terms"));
  it("opens with the attorney-review banner the owner deletes when ready", () =>
    expect(STARTER_TERMS.split("\n")[0]).toBe("**DRAFT: have a Nevada attorney review these terms before use, then delete this line.**"));
  it("has the eighteen sections, in order", () => {
    const headings = STARTER_TERMS.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toHaveLength(18);
    expect(headings[0]).toBe("## 1. Our Agreement");
    expect(headings[3]).toBe("## 4. Your Right to Cancel");
    expect(headings[17]).toBe("## 18. Contact Us");
  });
  it("uses only contract-time fields, and names the business only through them", () => {
    const keys = [...STARTER_TERMS.matchAll(markerPattern())].map((m) => m[1].trim());
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(TERMS_FIELDS).toContain(key);
    expect(STARTER_TERMS).not.toContain("Premier Shade Solutions LLC");
    expect(STARTER_TERMS).not.toMatch(/\(\d{3}\)\s?\d{3}-\d{4}/);
    expect(STARTER_TERMS).not.toContain("support@");
  });
  it("promises the 3-business-day window the Quote tab enforces", () =>
    expect(STARTER_TERMS).toContain("within **3 business days** of signing"));
  it("keeps the owner's filled prices", () => {
    expect(STARTER_TERMS).toContain("a return-trip charge of **$175** applies");
    expect(STARTER_TERMS).toContain("service visits are **$175 per visit**");
  });
  it("carries no HTML comment", () => expect(STARTER_TERMS).not.toContain("<!--"));
});
