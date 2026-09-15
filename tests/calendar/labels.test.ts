import { describe, it, expect } from "vitest";
import { cellWhen, spanLabel, whenLabel } from "@/lib/calendar/labels";

// Fri Sep 11 9:00 AM to Sun Sep 13 10:00 AM, Las Vegas time.
const start = new Date("2026-09-11T16:00:00Z");
const end = new Date("2026-09-13T17:00:00Z");

describe("schedule time labels", () => {
  it("leaves a same-day event unchanged", () => {
    const sameEnd = new Date("2026-09-11T17:00:00Z");
    expect(whenLabel(start, sameEnd, "2026-09-11")).toBe("9:00 AM");
    expect(spanLabel(start, sameEnd, "2026-09-11")).toBe("9:00 AM – 10:00 AM");
    expect(whenLabel(start, null, "2026-09-11")).toBe("9:00 AM");
  });

  it("dates the end on the start day's copy", () => {
    expect(whenLabel(start, end, "2026-09-11")).toBe("9:00 AM – Sun 10:00 AM");
    expect(spanLabel(start, end, "2026-09-11")).toBe("9:00 AM – Sun 10:00 AM");
  });

  it("dates both ends on a middle day's copy", () => {
    expect(whenLabel(start, end, "2026-09-12")).toBe("Fri 9:00 AM – Sun 10:00 AM");
    expect(spanLabel(start, end, "2026-09-12")).toBe("Fri 9:00 AM – Sun 10:00 AM");
  });

  it("dates the start on the end day's copy", () => {
    expect(whenLabel(start, end, "2026-09-13")).toBe("Fri 9:00 AM – 10:00 AM");
  });

  it("cellWhen keeps a short month-cell form: start time on the first day, 'Continues' after", () => {
    const sameEnd = new Date("2026-09-11T17:00:00Z");
    expect(cellWhen({ allDay: false, start, end: sameEnd }, "2026-09-11")).toBe("9:00 AM");
    expect(cellWhen({ allDay: false, start, end: null }, "2026-09-11")).toBe("9:00 AM");
    expect(cellWhen({ allDay: false, start, end }, "2026-09-11")).toBe("9:00 AM");
    expect(cellWhen({ allDay: false, start, end }, "2026-09-12")).toBe("Continues");
    expect(cellWhen({ allDay: false, start, end }, "2026-09-13")).toBe("Continues");
    expect(cellWhen({ allDay: true, start: null, end: null }, "2026-09-12")).toBe("All day");
  });

  it("keeps an event ending exactly at midnight a same-day event", () => {
    // Fri Sep 11 10:00 PM to Sat Sep 12 midnight.
    expect(whenLabel(new Date("2026-09-12T05:00:00Z"), new Date("2026-09-12T07:00:00Z"), "2026-09-11")).toBe("10:00 PM");
  });
});
