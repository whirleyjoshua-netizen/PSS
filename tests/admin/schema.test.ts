import { describe, it, expect } from "vitest";
import { detailsSchema, newJobSchema, noteSchema, lostSchema } from "@/lib/admin/schema";

describe("new job stage", () => {
  const base = { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone" };
  it("defaults to a new lead", () => {
    expect(newJobSchema.parse(base).stage).toBe("new");
    expect(newJobSchema.parse({ ...base, stage: "" }).stage).toBe("new");
  });
  it("accepts any working stage", () => {
    expect(newJobSchema.parse({ ...base, stage: "quoted" }).stage).toBe("quoted");
  });
  it("rejects lost and unknown stages", () => {
    const lost = newJobSchema.safeParse({ ...base, stage: "lost" });
    expect(lost.success).toBe(false);
    expect(lost.error?.issues[0].message).toBe("Pick a stage");
    expect(newJobSchema.safeParse({ ...base, stage: "shipped" }).success).toBe(false);
  });
});

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
      budgetTier: null,
      windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null,
    });
  });

  it("rejects an unknown brand and a nonsense amount", () => {
    expect(detailsSchema.safeParse({ brands: ["Acme"] }).success).toBe(false);
    expect(detailsSchema.safeParse({ quote: "lots" }).success).toBe(false);
  });

  it("rejects an impossible visit date without throwing", () => {
    const result = detailsSchema.safeParse({ visitAt: "2026-13-45T25:99" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe("Pick a valid visit date and time");
  });
});

describe("detailsSchema budget", () => {
  it("accepts a tier and maps blank to null", () => {
    expect(detailsSchema.parse({ budget: "premium" }).budgetTier).toBe("premium");
    expect(detailsSchema.parse({ budget: "" }).budgetTier).toBeNull();
    expect(detailsSchema.parse({}).budgetTier).toBeNull();
  });
  it("rejects an unknown tier", () => {
    expect(detailsSchema.safeParse({ budget: "luxury" }).success).toBe(false);
  });
});

describe("detailsSchema questionnaire fields", () => {
  it("parses exact windows, treatment types, motorized and gate code", () => {
    expect(detailsSchema.parse({ windowCountExact: "31", treatmentTypes: ["shutters"], motorized: true, gateCode: " 12# " }))
      .toMatchObject({ windowCountExact: 31, treatmentTypes: ["shutters"], motorized: true, gateCode: "12#" });
  });
  it("rejects bad values", () => {
    expect(detailsSchema.safeParse({ windowCountExact: "0" }).success).toBe(false);
    expect(detailsSchema.safeParse({ treatmentTypes: ["Blinds"] }).success).toBe(false);
    expect(detailsSchema.safeParse({ gateCode: "x".repeat(41) }).success).toBe(false);
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
