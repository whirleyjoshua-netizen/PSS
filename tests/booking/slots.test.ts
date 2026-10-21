import { describe, it, expect } from "vitest";
import { candidateDays, isCandidate, isOpen, openDays } from "@/lib/booking/slots";
import { slotDays, visitLabel } from "@/lib/booking/labels";

// Tuesday 2026-10-20, 3 PM in Las Vegas (PDT, UTC-7).
const NOW = new Date("2026-10-20T22:00:00Z");
const at = (iso: string) => new Date(iso);

describe("candidateDays", () => {
  const days = candidateDays(NOW);

  it("starts tomorrow, runs two weeks, and skips Sundays", () => {
    expect(days[0].date).toBe("2026-10-21");
    expect(days.at(-1)!.date).toBe("2026-11-03");
    expect(days.map((d) => d.date)).not.toContain("2026-10-25");
    expect(days.map((d) => d.date)).not.toContain("2026-11-01");
    expect(days).toHaveLength(12);
  });

  it("offers every hour from 8 AM to 4 PM Las Vegas time, so a 2-hour block ends by 6", () => {
    expect(slotDays([days[0]])[0].slots.map((s) => s.label)).toEqual(
      ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"]);
    expect(days[0].slots[0]).toEqual(at("2026-10-21T15:00:00Z"));
  });

  it("follows the clock across the switch back to standard time", () => {
    const after = days.find((d) => d.date === "2026-11-02")!;
    expect(after.slots[0]).toEqual(at("2026-11-02T16:00:00Z"));
  });

  it("starts tomorrow even late in the evening", () => {
    expect(candidateDays(new Date("2026-10-21T06:30:00Z"))[0].date).toBe("2026-10-21");
  });
});

describe("isOpen", () => {
  const ten = at("2026-10-21T17:00:00Z"); // 10:00 AM
  const busy = (from: string, to: string) => ({ start: at(from), end: at(to) });

  it("is open on an empty day", () => {
    expect(isOpen(ten, [])).toBe(true);
  });
  it("needs the visit and the drive after it clear of the next event", () => {
    expect(isOpen(ten, [busy("2026-10-21T19:00:00Z", "2026-10-21T20:00:00Z")])).toBe(true); // noon
    expect(isOpen(ten, [busy("2026-10-21T18:45:00Z", "2026-10-21T20:00:00Z")])).toBe(false); // 11:45
  });
  it("needs a drive after anything that ends before it", () => {
    expect(isOpen(ten, [busy("2026-10-21T15:00:00Z", "2026-10-21T16:30:00Z")])).toBe(true); // ends 9:30
    expect(isOpen(ten, [busy("2026-10-21T15:00:00Z", "2026-10-21T16:45:00Z")])).toBe(false); // ends 9:45
  });
  it("is closed by an event inside the block", () => {
    expect(isOpen(ten, [busy("2026-10-21T17:30:00Z", "2026-10-21T17:45:00Z")])).toBe(false);
  });
});

describe("openDays", () => {
  it("drops taken times, and a day with none left", () => {
    const wholeDay = { start: at("2026-10-21T07:00:00Z"), end: at("2026-10-22T07:00:00Z") };
    const morning = { start: at("2026-10-22T15:00:00Z"), end: at("2026-10-22T16:00:00Z") }; // 8 to 9 AM on the 22nd
    const days = openDays(NOW, [wholeDay, morning]);
    expect(days[0].date).toBe("2026-10-22");
    expect(slotDays([days[0]])[0].slots[0].label).toBe("10:00 AM");
  });
});

describe("isCandidate", () => {
  it("accepts an offered start and nothing else", () => {
    expect(isCandidate(at("2026-10-21T17:00:00Z"), NOW)).toBe(true);
    expect(isCandidate(at("2026-10-21T17:30:00Z"), NOW)).toBe(false); // 10:30
    expect(isCandidate(at("2026-10-20T23:00:00Z"), NOW)).toBe(false); // today
    expect(isCandidate(at("2026-10-25T17:00:00Z"), NOW)).toBe(false); // Sunday
    expect(isCandidate(at("2026-10-22T00:00:00Z"), NOW)).toBe(false); // 5 PM
  });
});

describe("visitLabel", () => {
  it("names the day and time in Las Vegas", () => {
    expect(visitLabel(at("2026-10-22T17:00:00Z"))).toBe("Thursday, October 22 at 10:00 AM");
  });
});
