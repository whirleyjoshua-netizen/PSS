import { describe, it, expect } from "vitest";
import { dayLabel, daysBetween, formatDateOnly, formatShortDate, formatTime, formatCallVisit } from "@/lib/admin/time";

describe("formatCallVisit", () => {
  it("formats a Las Vegas visit time in summer and winter", () => {
    expect(formatCallVisit(new Date("2026-10-14T21:00:00Z"))).toBe("Wed 10/14, 2:00 PM");
    expect(formatCallVisit(new Date("2026-12-01T22:30:00Z"))).toBe("Tue 12/1, 2:30 PM");
  });
});

describe("job page date helpers", () => {
  const now = new Date("2026-09-14T18:00:00Z"); // 11:00 AM Sep 14 in Las Vegas

  it("formats a short date in Las Vegas time", () => {
    expect(formatShortDate(new Date("2026-09-11T18:00:00Z"))).toBe("Sep 11, 2026");
  });

  it("formats a date-only value without shifting the day", () => {
    expect(formatDateOnly("2026-10-12")).toBe("Oct 12, 2026");
  });

  it("formats a clock time in Las Vegas time", () => {
    expect(formatTime(new Date("2026-09-14T17:31:00Z"))).toMatch(/^10:31\sAM$/);
  });

  it("counts Las Vegas calendar days, not 24-hour spans", () => {
    expect(daysBetween(new Date("2026-09-11T18:00:00Z"), now)).toBe(3);
    // 11:30 PM Sep 13 → 1:00 AM Sep 14 is one calendar day
    expect(daysBetween(new Date("2026-09-14T06:30:00Z"), new Date("2026-09-14T08:00:00Z"))).toBe(1);
    expect(daysBetween(now, now)).toBe(0);
  });

  it("labels days relative to now", () => {
    expect(dayLabel(new Date("2026-09-14T17:31:00Z"), now)).toBe("Today");
    expect(dayLabel(new Date("2026-09-13T23:16:00Z"), now)).toBe("Yesterday");
    expect(dayLabel(new Date("2026-09-11T18:00:00Z"), now)).toBe("Sep 11");
    expect(dayLabel(new Date("2025-12-30T20:00:00Z"), now)).toBe("Dec 30, 2025");
  });
});
