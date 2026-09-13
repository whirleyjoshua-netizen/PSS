import { describe, it, expect } from "vitest";
import { consultationSchema } from "@/lib/leads/schema";

const valid = {
  name: "Dana Reyes",
  phone: "702-555-0134",
  email: "dana@example.com",
  city: "Henderson",
  source: "hero" as const,
};

describe("consultationSchema", () => {
  it("accepts the minimum hero payload", () => {
    expect(consultationSchema.safeParse(valid).success).toBe(true);
  });

  it("normalizes a formatted phone number to ten digits", () => {
    const parsed = consultationSchema.parse({ ...valid, phone: "(702) 555-0134" });
    expect(parsed.phone).toBe("7025550134");
  });

  it("strips a leading country code", () => {
    const parsed = consultationSchema.parse({ ...valid, phone: "+1 (702) 555-0134" });
    expect(parsed.phone).toBe("7025550134");
  });

  it("rejects a phone number that is not ten digits", () => {
    expect(consultationSchema.safeParse({ ...valid, phone: "555" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(consultationSchema.safeParse({ ...valid, email: "dana@" }).success).toBe(false);
  });

  it("lowercases the email so duplicates collapse", () => {
    const parsed = consultationSchema.parse({ ...valid, email: "Dana@Example.COM" });
    expect(parsed.email).toBe("dana@example.com");
  });

  it("rejects a city outside the service area", () => {
    expect(consultationSchema.safeParse({ ...valid, city: "Phoenix" }).success).toBe(false);
  });

  it("rejects a submission whose honeypot is filled", () => {
    expect(consultationSchema.safeParse({ ...valid, company: "spam" }).success).toBe(false);
  });

  it("trims whitespace from the name", () => {
    expect(consultationSchema.parse({ ...valid, name: "  Dana  " }).name).toBe("Dana");
  });

  it("rejects a name too short to be real", () => {
    expect(consultationSchema.safeParse({ ...valid, name: "D" }).success).toBe(false);
  });

  it("accepts the full contact payload", () => {
    const full = {
      ...valid,
      address: "123 Sunset Rd",
      treatments: ["shades", "shutters"],
      windowCount: "6-10",
      heardVia: "Google",
      notes: "West-facing living room, brutal afternoon sun.",
      source: "contact" as const,
    };
    expect(consultationSchema.safeParse(full).success).toBe(true);
  });

  it("rejects an unknown window count", () => {
    expect(
      consultationSchema.safeParse({ ...valid, windowCount: "a hundred" }).success,
    ).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(consultationSchema.safeParse({ ...valid, source: "carrier-pigeon" }).success).toBe(
      false,
    );
  });

  it("drops an overlong referral code instead of failing the whole lead", () => {
    const parsed = consultationSchema.safeParse({ ...valid, referralCode: "X".repeat(25) });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.referralCode).toBeUndefined();
  });
});
