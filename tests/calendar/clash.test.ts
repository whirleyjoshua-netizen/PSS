import { describe, it, expect } from "vitest";
import { clashes } from "@/lib/calendar/clash";

const slotStart = new Date("2026-09-20T17:00:00Z"); // slot [17:00, 18:00) UTC

describe("clashes", () => {
  it("is a clash when the item overlaps the slot", () => {
    expect(clashes({ allDay: false, start: new Date("2026-09-20T17:30:00Z"), end: new Date("2026-09-20T18:30:00Z") }, slotStart)).toBe(true);
  });

  it("is a clash when the item contains the slot", () => {
    expect(clashes({ allDay: false, start: new Date("2026-09-20T16:00:00Z"), end: new Date("2026-09-20T19:00:00Z") }, slotStart)).toBe(true);
  });

  it("is not a clash when edges only touch", () => {
    expect(clashes({ allDay: false, start: new Date("2026-09-20T18:00:00Z"), end: new Date("2026-09-20T19:00:00Z") }, slotStart)).toBe(false);
    expect(clashes({ allDay: false, start: new Date("2026-09-20T15:00:00Z"), end: new Date("2026-09-20T17:00:00Z") }, slotStart)).toBe(false);
  });

  it("all-day items never clash", () => {
    expect(clashes({ allDay: true, start: null, end: null }, slotStart)).toBe(false);
  });

  it("treats a null end as 60 minutes", () => {
    expect(clashes({ allDay: false, start: new Date("2026-09-20T17:30:00Z"), end: null }, slotStart)).toBe(true);
    expect(clashes({ allDay: false, start: new Date("2026-09-20T18:00:00Z"), end: null }, slotStart)).toBe(false);
  });
});
