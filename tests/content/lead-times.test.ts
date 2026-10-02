import { describe, it, expect } from "vitest";
import { leadTimes } from "@/content/lead-times";
import { PRODUCTION_ESTIMATE } from "@/content/business";
import { formatShortDate, installWindow, isAfterDay, leadTimeSummary, todayInLasVegas } from "@/lib/lead-times";
import { STARTER_TERMS } from "@/lib/docs/starter-terms";

describe("lead times", () => {
  it("match the starter terms: blinds and shades 3–5 weeks, shutters 6–10", () => {
    expect(leadTimes).toEqual([
      { label: "Blinds", minWeeks: 3, maxWeeks: 5 },
      { label: "Shades", minWeeks: 3, maxWeeks: 5 },
      { label: "Shutters", minWeeks: 6, maxWeeks: 10 },
    ]);
    expect(STARTER_TERMS).toContain("Shades and blinds: about **3–5 weeks**");
    expect(STARTER_TERMS).toContain("Shutters: about **6–10 weeks**");
  });

  it("feed the customer's project page, so the site never contradicts the contract", () => {
    expect(PRODUCTION_ESTIMATE).toBe("Typically blinds and shades 3–5 weeks, shutters 6–10 weeks from order to install");
  });

  it("group products that share a range", () => {
    expect(
      leadTimeSummary([
        { label: "Blinds", minWeeks: 3, maxWeeks: 5 },
        { label: "Shades", minWeeks: 3, maxWeeks: 5 },
        { label: "Shutters", minWeeks: 6, maxWeeks: 10 },
      ]),
    ).toBe("blinds and shades 3–5 weeks, shutters 6–10 weeks");
  });
});

describe("todayInLasVegas", () => {
  it("is still yesterday in Las Vegas late in the evening, when UTC has rolled over", () => {
    // Run as a visitor's machine set to UTC would, so the test cannot pass on this Mac's own Las Vegas clock.
    const tz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      // 10pm PDT on Oct 2 is 5am UTC on Oct 3.
      expect(formatShortDate(todayInLasVegas(new Date("2026-10-03T05:00:00Z")))).toBe("Oct 2");
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});

describe("installWindow", () => {
  const today = todayInLasVegas(new Date("2026-10-02T18:00:00Z"));

  it("counts whole weeks from today", () => {
    const { from, to } = installWindow({ label: "Blinds", minWeeks: 3, maxWeeks: 5 }, today);
    expect(formatShortDate(from)).toBe("Oct 23");
    expect(formatShortDate(to)).toBe("Nov 6");
  });

  it("does not drift a day across the November clock change", () => {
    const { from, to } = installWindow({ label: "Shutters", minWeeks: 6, maxWeeks: 10 }, today);
    expect(formatShortDate(from)).toBe("Nov 13");
    expect(formatShortDate(to)).toBe("Dec 11");
  });
});

describe("isAfterDay", () => {
  it("is false on the day itself and true the day after", () => {
    expect(isAfterDay(todayInLasVegas(new Date("2026-12-24T20:00:00Z")), "2026-12-24")).toBe(false);
    expect(isAfterDay(todayInLasVegas(new Date("2026-12-25T20:00:00Z")), "2026-12-24")).toBe(true);
  });
});
