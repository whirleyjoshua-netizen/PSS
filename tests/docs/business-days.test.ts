import { describe, expect, it } from "vitest";
import {
  cancellationWindowEnd, cancellationWindowLastDay, federalHolidays, inCancellationWindow, isBusinessDay, isFederalHoliday,
} from "@/lib/docs/business-days";

// Las Vegas is UTC-7 in summer (PDT) and UTC-8 in winter (PST).
const end = (signedAtUtc: string) => cancellationWindowEnd(new Date(signedAtUtc)).toISOString();

describe("federal holidays", () => {
  it("lists 2026's eleven holidays plus Independence Day observed on Friday Jul 3", () => {
    expect(federalHolidays(2026)).toEqual([
      "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-07-04",
      "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
    ]);
  });
  it("observes next year's Saturday New Year's Day on this year's Dec 31", () => {
    expect(isFederalHoliday("2027-12-31")).toBe(true);
    expect(isFederalHoliday("2027-12-24")).toBe(true); // Christmas 2027 is a Saturday
    expect(isFederalHoliday("2027-12-30")).toBe(false);
  });
  it("counts every day but Sundays and holidays as a business day", () => {
    expect(isBusinessDay("2026-10-03")).toBe(true); // Saturday
    expect(isBusinessDay("2026-10-04")).toBe(false); // Sunday
    expect(isBusinessDay("2026-10-12")).toBe(false); // Columbus Day
  });
});

describe("cancellation window", () => {
  it("ends at midnight after the third business day: signed Monday, ends Thursday night", () => {
    expect(cancellationWindowLastDay(new Date("2026-09-28T17:00:00Z"))).toBe("2026-10-01");
    expect(end("2026-09-28T17:00:00Z")).toBe("2026-10-02T07:00:00.000Z");
  });
  it("skips Sunday", () => expect(end("2026-10-01T17:00:00Z")).toBe("2026-10-06T07:00:00.000Z"));
  it("skips a Monday holiday", () => expect(end("2026-10-09T17:00:00Z")).toBe("2026-10-15T07:00:00.000Z"));
  it("counts from a Saturday signing", () => expect(end("2026-10-03T17:00:00Z")).toBe("2026-10-08T07:00:00.000Z"));
  it("uses the Las Vegas date: 11:30 PM on Oct 1 is an Oct 1 signing", () =>
    expect(end("2026-10-02T06:30:00Z")).toBe("2026-10-06T07:00:00.000Z"));
  it("skips an observed holiday and the holiday itself", () =>
    expect(end("2026-07-02T17:00:00Z")).toBe("2026-07-09T07:00:00.000Z"));
  it("skips Thanksgiving, ending in standard time", () =>
    expect(end("2026-11-25T18:00:00Z")).toBe("2026-12-01T08:00:00.000Z"));
  it("crosses the year end over New Year's Day", () =>
    expect(end("2026-12-30T18:00:00Z")).toBe("2027-01-05T08:00:00.000Z"));
  it("is open until that instant and closed from it", () => {
    const signed = new Date("2026-09-28T17:00:00Z");
    expect(inCancellationWindow(signed, new Date("2026-10-02T06:59:59Z"))).toBe(true);
    expect(inCancellationWindow(signed, new Date("2026-10-02T07:00:00Z"))).toBe(false);
  });
});
