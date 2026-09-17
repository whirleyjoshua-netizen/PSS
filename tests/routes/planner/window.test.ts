import { describe, it, expect } from "vitest";
import {
  addDaysIso, adminWindowLabel, clockLabel, clockMinutes, clockOf, emailWindowLine, hoursLabel, minutesClock, WINDOW_OPTIONS,
} from "@/lib/routes/window";

describe("window helpers", () => {
  it("converts clocks and minutes both ways", () => {
    expect(clockMinutes("09:30")).toBe(570);
    expect(minutesClock(570)).toBe("09:30");
    expect(minutesClock(clockMinutes("18:00"))).toBe("18:00");
  });

  it("labels admin times with uppercase AM/PM", () => {
    expect(clockLabel("08:00")).toBe("8:00 AM");
    expect(clockLabel("12:00")).toBe("12:00 PM");
    expect(clockLabel("13:30")).toBe("1:30 PM");
  });

  it("shares the am/pm when both ends are on the same side of noon", () => {
    expect(adminWindowLabel("08:00", "10:00")).toBe("8:00 – 10:00 AM");
    expect(adminWindowLabel("11:30", "13:00")).toBe("11:30 AM – 1:00 PM");
    expect(adminWindowLabel("08:00", null)).toBeNull();
  });

  it("writes the email line only when a window is set", () => {
    expect(emailWindowLine("08:00", "10:00")).toBe("We'll arrive between 8:00 and 10:00 am.");
    expect(emailWindowLine("11:30", "13:00")).toBe("We'll arrive between 11:30 am and 1:00 pm.");
    expect(emailWindowLine(null, null)).toBeNull();
  });

  it("offers 30-minute steps", () => {
    expect(WINDOW_OPTIONS[0].value).toBe("06:00");
    expect(WINDOW_OPTIONS[1].value).toBe("06:30");
    expect(WINDOW_OPTIONS.at(-1)!.value).toBe("20:00");
  });

  it("shows lengths in hours", () => {
    expect(hoursLabel(90)).toBe("1.5");
    expect(hoursLabel(240)).toBe("4");
    expect(hoursLabel(75)).toBe("1.25");
  });

  it("moves a calendar day forward or back, across months and years", () => {
    expect(addDaysIso("2026-09-16", 1)).toBe("2026-09-17");
    expect(addDaysIso("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysIso("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDaysIso("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("reads a database time as a clock, and anything else as none", () => {
    expect(clockOf("08:30:00")).toBe("08:30");
    expect(clockOf(null)).toBeNull();
    expect(clockOf(undefined)).toBeNull();
  });
});
