import { describe, it, expect } from "vitest";
import { CALL_OUTCOMES, callStageMove, callSummary } from "@/lib/admin/call";

const base = { treatmentTypes: [], motorized: false, windowCountExact: null, gateCode: null, budgetTier: null, notes: null, visitAt: null, followUpAt: null, followUpNote: null };

describe("call outcomes", () => {
  it("are booked, talked and no answer", () => {
    expect(CALL_OUTCOMES).toEqual(["booked", "talked", "no_answer"]);
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
      ...base, outcome: "booked", treatmentTypes: ["cellular_shades", "shutters"], motorized: true, windowCountExact: 12,
      gateCode: "#4321", budgetTier: "mid", visitAt: new Date("2026-10-14T21:00:00Z"),
    })).toBe("Call: booked visit Wed 10/14, 2:00 PM · Shutters, Cellular shades · Motorized · 12 windows · Mid-range");
  });
  it("leaves out what wasn't learned, and never the gate code", () => {
    expect(callSummary({ ...base, outcome: "talked", treatmentTypes: ["roller_shades"], budgetTier: "value", gateCode: "#4321" }))
      .toBe("Call: talked, no visit yet · Roller shades · Value");
    expect(callSummary({ ...base, outcome: "no_answer" })).toBe("Call: no answer");
  });
  it("never includes the notes", () => {
    expect(callSummary({ ...base, outcome: "talked", notes: "Call back Friday" })).toBe("Call: talked, no visit yet");
  });
  it("adds the call-back to the summary", () => {
    expect(callSummary({ ...base, outcome: "no_answer", followUpAt: new Date("2026-10-16T17:00:00Z"), followUpNote: "checking with husband" }))
      .toBe("Call: no answer · Call back Fri 10/16, 10:00 AM · checking with husband");
  });
});
