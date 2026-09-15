import { describe, it, expect } from "vitest";
import { callSchema } from "@/lib/admin/schema";

const ok = { outcome: "talked", treatments: [], windowCount: "", budget: "", notes: "", visitAt: "" };

describe("callSchema", () => {
  it("parses a talked call to a clean input", () => {
    expect(callSchema.parse({ ...ok, treatments: ["Shades"], windowCount: "11-20", budget: "premium", notes: " Call back " }))
      .toEqual({ outcome: "talked", treatments: ["Shades"], windowCount: "11-20", budgetTier: "premium", notes: "Call back", visitAt: null, followUpAt: null, followUpNote: null });
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
  it("rejects an impossible visit date without throwing", () => {
    const result = callSchema.safeParse({ ...ok, outcome: "booked", visitAt: "2026-13-45T25:99" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe("Pick the visit date and time");
  });
  it("rejects a rolled-over impossible visit date like Feb 30", () => {
    const result = callSchema.safeParse({ ...ok, outcome: "booked", visitAt: "2026-02-30T14:00" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe("Pick the visit date and time");
  });
  it("still accepts a valid visit date", () => {
    expect(callSchema.parse({ ...ok, outcome: "booked", visitAt: "2026-10-14T14:00" }).visitAt)
      .toEqual(new Date("2026-10-14T21:00:00Z"));
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
  it("keeps a call-back only for talked or no answer", () => {
    const parsed = callSchema.parse({ ...ok, outcome: "no_answer", callBackAt: "2026-10-16T10:00", callBackNote: " checking with husband " });
    expect(parsed.followUpAt).toEqual(new Date("2026-10-16T17:00:00Z"));
    expect(parsed.followUpNote).toBe("checking with husband");
    const booked = callSchema.parse({ ...ok, outcome: "booked", visitAt: "2026-10-14T14:00", callBackAt: "2026-10-16T10:00" });
    expect(booked.followUpAt).toBeNull();
    expect(booked.followUpNote).toBeNull();
  });
  it("drops a reason with no call-back time", () => {
    expect(callSchema.parse({ ...ok, callBackNote: "x" }).followUpNote).toBeNull();
  });
  it("rejects a bad call-back time or a long reason", () => {
    expect(callSchema.safeParse({ ...ok, callBackAt: "2026-13-45T25:99" }).error!.issues[0].message).toBe("Pick a valid call-back date and time");
    expect(callSchema.safeParse({ ...ok, callBackAt: "2026-10-16T10:00", callBackNote: "x".repeat(201) }).error!.issues[0].message)
      .toBe("Keep the reason under 200 characters");
  });
});
