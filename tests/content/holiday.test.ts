import { describe, it, expect } from "vitest";
import { HOLIDAY_OFFER_LINE, holidayFaq, holidayLeadTimes, holidayStage } from "@/content/holiday";
import { leadTimes } from "@/content/lead-times";

const at = (iso: string) => new Date(iso);
const weeks = (label: string) => {
  const t = leadTimes.find((l) => l.label === label)!;
  return `${t.minWeeks}–${t.maxWeeks} weeks`;
};

describe("holiday stage follows the banner's dates", () => {
  it("is the offer through the end of Nov 15 in Las Vegas", () => {
    expect(holidayStage(at("2026-10-10T12:00:00-07:00"))).toBe("offer");
    expect(holidayStage(at("2026-11-15T23:59:00-08:00"))).toBe("offer");
  });
  it("is the family message from Nov 16 through Dec 24", () => {
    expect(holidayStage(at("2026-11-16T00:00:00-08:00"))).toBe("family");
    expect(holidayStage(at("2026-12-24T23:59:00-08:00"))).toBe("family");
  });
  it("is over from Dec 25", () => {
    expect(holidayStage(at("2026-12-25T00:00:00-08:00"))).toBe("over");
  });
});

describe("holiday copy", () => {
  it("states the owner's offer: shades or blinds, consult booked by Nov 15", () => {
    expect(HOLIDAY_OFFER_LINE).toBe("10% off 3 or more custom shades or blinds. Book your free consult by Nov 15.");
  });
  it("takes its weeks from lead-times.ts and promises no date", () => {
    for (const text of [holidayLeadTimes("offer"), holidayFaq("offer")[0]!.a]) {
      expect(text).toContain(weeks("Shades"));
      expect(text).toContain(weeks("Shutters"));
      expect(text).not.toMatch(/guarantee|before Christmas|in time for/i);
    }
  });
  it("says shutters aren't part of the 10% only while the offer runs", () => {
    expect(holidayLeadTimes("offer")).toMatch(/Shutters aren't part of the 10%/);
    expect(holidayLeadTimes("family")).not.toMatch(/10%/);
  });
  it("drops the 10% question once the offer ends", () => {
    expect(holidayFaq("offer").map((f) => f.q)).toEqual(["Will it be installed by Christmas?", "What counts toward the 10%?"]);
    expect(holidayFaq("family").map((f) => f.q)).toEqual(["Will it be installed by Christmas?"]);
    expect(holidayFaq("offer")[1]!.a).toMatch(/shades or blinds.*motorized included.*Shutters aren't included/);
  });
});
