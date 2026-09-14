import { describe, it, expect } from "vitest";
import { CALL_OUTCOMES, TREATMENT_NAMES, callStageMove, callSummary } from "@/lib/admin/call";

const base = { treatments: [], windowCount: null, budgetTier: null, notes: null, visitAt: null };

describe("call outcomes", () => {
  it("are booked, talked and no answer", () => {
    expect(CALL_OUTCOMES).toEqual(["booked", "talked", "no_answer"]);
  });
  it("offer the website form's treatment categories", () => {
    expect(TREATMENT_NAMES).toEqual(["Blinds", "Shades", "Shutters", "Outdoor Shading", "Motorization"]);
  });
});

describe("callStageMove", () => {
  it("books a visit only from new or contacted", () => {
    expect(callStageMove("booked")).toEqual({ to: "visit_booked", from: ["new", "contacted"] });
  });
  it("marks contacted only from new", () => {
    expect(callStageMove("talked")).toEqual({ to: "contacted", from: ["new"] });
  });
  it("never moves on no answer", () => {
    expect(callStageMove("no_answer")).toBeNull();
  });
});

describe("callSummary", () => {
  it("describes a booked visit with everything learned", () => {
    expect(callSummary({
      ...base, outcome: "booked", treatments: ["Shutters", "Shades"], windowCount: "6-10",
      budgetTier: "mid", visitAt: new Date("2026-10-14T21:00:00Z"),
    })).toBe("Call: booked visit Wed 10/14, 2:00 PM · Shutters, Shades · 6-10 windows · Mid-range");
  });
  it("leaves out what wasn't learned", () => {
    expect(callSummary({ ...base, outcome: "talked", treatments: ["Blinds"], budgetTier: "value" }))
      .toBe("Call: talked, no visit yet · Blinds · Value");
    expect(callSummary({ ...base, outcome: "no_answer" })).toBe("Call: no answer");
  });
  it("never includes the notes", () => {
    expect(callSummary({ ...base, outcome: "talked", notes: "Call back Friday" })).toBe("Call: talked, no visit yet");
  });
});
