import { describe, it, expect } from "vitest";
import { callSchema } from "@/lib/admin/schema";

const ok = { outcome: "talked", treatments: [], windowCount: "", budget: "", notes: "", visitAt: "" };

describe("callSchema", () => {
  it("parses a talked call to a clean input", () => {
    expect(callSchema.parse({ ...ok, treatments: ["Shades"], windowCount: "11-20", budget: "premium", notes: " Call back " }))
      .toEqual({ outcome: "talked", treatments: ["Shades"], windowCount: "11-20", budgetTier: "premium", notes: "Call back", visitAt: null });
  });
  it("requires a visit time only when booking", () => {
    const missing = callSchema.safeParse({ ...ok, outcome: "booked" });
    expect(missing.success).toBe(false);
    expect(missing.error!.issues[0].message).toBe("Pick the visit date and time");
    const booked = callSchema.parse({ ...ok, outcome: "booked", visitAt: "2026-10-14T14:00" });
    expect(booked.visitAt).toEqual(new Date("2026-10-14T21:00:00Z"));
  });
  it("ignores a visit time for other outcomes", () => {
    expect(callSchema.parse({ ...ok, outcome: "no_answer", visitAt: "2026-10-14T14:00" }).visitAt).toBeNull();
  });
  it("rejects a malformed visit time", () => {
    expect(callSchema.safeParse({ ...ok, outcome: "booked", visitAt: "tomorrow" }).success).toBe(false);
  });
  it("rejects an unknown outcome, treatment, window range or budget", () => {
    expect(callSchema.safeParse({ ...ok, outcome: "voicemail" }).error!.issues[0].message).toBe("Pick how the call went");
    expect(callSchema.safeParse({ ...ok, treatments: ["Curtains"] }).success).toBe(false);
    expect(callSchema.safeParse({ ...ok, windowCount: "50" }).success).toBe(false);
    expect(callSchema.safeParse({ ...ok, budget: "luxury" }).success).toBe(false);
  });
  it("limits notes to 2,000 characters", () => {
    expect(callSchema.safeParse({ ...ok, notes: "x".repeat(2001) }).success).toBe(false);
  });
});
