import { describe, it, expect } from "vitest";
import { detailsSchema, newJobSchema, noteSchema, lostSchema } from "@/lib/admin/schema";

describe("detailsSchema", () => {
  it("turns form strings into typed values, with blanks as null", () => {
    const parsed = detailsSchema.parse({
      visitAt: "2026-12-15T14:30", quote: "$4,500", sold: "", deposit: "2250",
      brands: ["Alta Window Fashions"], orderedOn: "", installOn: "2027-01-10",
    });
    expect(parsed).toEqual({
      visitAt: new Date("2026-12-15T22:30:00.000Z"),
      quoteCents: 450000, soldCents: null, depositCents: 225000,
      brands: ["Alta Window Fashions"], orderedOn: null, installOn: "2027-01-10",
    });
  });

  it("rejects an unknown brand and a nonsense amount", () => {
    expect(detailsSchema.safeParse({ brands: ["Acme"] }).success).toBe(false);
    expect(detailsSchema.safeParse({ quote: "lots" }).success).toBe(false);
  });
});

describe("newJobSchema", () => {
  it("accepts a phone lead without an email", () => {
    const parsed = newJobSchema.parse({
      name: "Dana Reyes", phone: "(702) 555-0134", email: "", city: "Henderson", source: "phone",
    });
    expect(parsed.phone).toBe("7025550134");
    expect(parsed.email).toBeUndefined();
  });

  it("requires a known source and a service-area city", () => {
    expect(newJobSchema.safeParse({ name: "Dana", phone: "7025550134", city: "Henderson", source: "hero" }).success).toBe(false);
    expect(newJobSchema.safeParse({ name: "Dana", phone: "7025550134", city: "Phoenix", source: "phone" }).success).toBe(false);
  });
});

describe("notes and lost reasons", () => {
  it("must not be empty", () => {
    expect(noteSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(lostSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(lostSchema.parse({ reason: " Went with a cheaper quote " }).reason).toBe("Went with a cheaper quote");
  });
});
