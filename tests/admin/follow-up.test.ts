import { describe, it, expect } from "vitest";
import { callBackProblem, dueLabel, endOfTodayLasVegas, formatFollowUp, quickPicks } from "@/lib/admin/follow-up";

// 2026-10-14 is a Wednesday; Las Vegas is UTC-7 in October, UTC-8 in December.
const at = (iso: string) => new Date(iso);

describe("quickPicks", () => {
  it("offers later today before 3 PM", () => {
    expect(quickPicks(at("2026-10-14T16:00:00Z"))).toEqual([ // 9:00 AM Las Vegas
      { label: "Later today 4 PM", value: "2026-10-14T16:00" },
      { label: "Tomorrow 10 AM", value: "2026-10-15T10:00" },
      { label: "In 2 days 10 AM", value: "2026-10-16T10:00" },
      { label: "Next week 10 AM", value: "2026-10-21T10:00" },
    ]);
  });
  it("drops later today from 3 PM on", () => {
    expect(quickPicks(at("2026-10-14T22:30:00Z")).map((p) => p.label)) // 3:30 PM Las Vegas
      .toEqual(["Tomorrow 10 AM", "In 2 days 10 AM", "Next week 10 AM"]);
  });
  it("rolls over month ends", () => {
    expect(quickPicks(at("2026-10-31T23:00:00Z"))[0]).toEqual({ label: "Tomorrow 10 AM", value: "2026-11-01T10:00" });
  });
});

describe("endOfTodayLasVegas", () => {
  it("is midnight starting tomorrow in Las Vegas", () => {
    expect(endOfTodayLasVegas(at("2026-10-14T20:00:00Z"))).toEqual(at("2026-10-15T07:00:00Z"));
    expect(endOfTodayLasVegas(at("2026-12-01T20:00:00Z"))).toEqual(at("2026-12-02T08:00:00Z"));
  });
});

describe("labels", () => {
  it("formats a follow-up with and without a reason", () => {
    expect(formatFollowUp(at("2026-10-16T17:00:00Z"), "checking with husband")).toBe("Fri 10/16, 10:00 AM · checking with husband");
    expect(formatFollowUp(at("2026-10-16T17:00:00Z"), null)).toBe("Fri 10/16, 10:00 AM");
  });
  it("marks overdue and today", () => {
    const now = at("2026-10-14T20:00:00Z"); // 1:00 PM Las Vegas
    expect(dueLabel(at("2026-10-14T19:00:00Z"), now)).toEqual({ overdue: true, text: "Overdue · Wed 10/14, 12:00 PM" });
    expect(dueLabel(at("2026-10-14T21:00:00Z"), now)).toEqual({ overdue: false, text: "Today · 2:00 PM" });
  });
});

describe("callBackProblem", () => {
  const now = at("2026-10-14T20:00:00Z");
  it("accepts a real time, including the past", () => {
    expect(callBackProblem("2026-10-15T10:00", now)).toBeNull();
    expect(callBackProblem("2026-10-01T10:00", now)).toBeNull();
  });
  it("rejects impossible or far-off times", () => {
    expect(callBackProblem("2026-13-45T25:99", now)).toBe("Pick a valid call-back date and time");
    expect(callBackProblem("tomorrow", now)).toBe("Pick a valid call-back date and time");
    expect(callBackProblem("2027-11-01T10:00", now)).toBe("Pick a call-back within a year");
  });
});
