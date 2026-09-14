import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const enabled = vi.fn(() => false);
vi.mock("@/lib/calendar/config", () => ({
  calendarEnabled: () => enabled(), calendarConfig: () => (enabled() ? { mailbox: "jobs@example.com" } : null),
}));
const graphJson = vi.fn();
vi.mock("@/lib/calendar/graph", () => ({ graphJson }));
const week = await import("@/lib/calendar/week");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const NOW = new Date("2026-09-16T19:00:00Z"); // Wed Sep 16, noon in Las Vegas
const PST = "Pacific Standard Time";

beforeEach(() => { sql.mockReset().mockResolvedValue([]); graphJson.mockReset(); enabled.mockReturnValue(false); });

describe("weekDays", () => {
  it("runs Sunday to Saturday around today in Las Vegas", () => {
    expect(week.weekDays(undefined, NOW)).toEqual([
      "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19",
    ]);
  });

  it("uses any date inside the requested week and ignores junk", () => {
    expect(week.weekDays("2026-10-01", NOW)[0]).toBe("2026-09-27");
    expect(week.weekDays("2026-13-45", NOW)[0]).toBe("2026-09-13");
    expect(week.weekDays("nope", NOW)[0]).toBe("2026-09-13");
  });

  it("uses Las Vegas's date late on Saturday evening, not UTC's", () => {
    // 04:00Z Sunday is still Saturday 9 PM in Las Vegas.
    expect(week.weekDays(undefined, new Date("2026-09-20T04:00:00Z"))[0]).toBe("2026-09-13");
  });
});

describe("rangeLabel and addDays", () => {
  it("labels weeks within a month, across months and across years", () => {
    expect(week.rangeLabel(week.weekDays("2026-09-13", NOW))).toBe("Sep 13 – 19, 2026");
    expect(week.rangeLabel(week.weekDays("2026-09-27", NOW))).toBe("Sep 27 – Oct 3, 2026");
    expect(week.rangeLabel(week.weekDays("2026-12-27", NOW))).toBe("Dec 27, 2026 – Jan 2, 2027");
    expect(week.addDays("2026-09-13", -7)).toBe("2026-09-06");
  });
});

describe("getWeek", () => {
  const trackerRow = { id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked",
    visit_at: "2026-09-17T17:00:00Z", install_on: "2026-09-19" };

  it("shows tracker dates with a notice when Outlook is not connected", async () => {
    sql.mockResolvedValueOnce([trackerRow]);
    const result = await week.getWeek(undefined, NOW);
    expect(result.source).toBe("tracker");
    expect(result.notice).toBe("Outlook isn't connected yet.");
    expect(result.items).toEqual([
      expect.objectContaining({ day: "2026-09-17", allDay: false, job: expect.objectContaining({ id: ID, kind: "visit" }) }),
      expect.objectContaining({ day: "2026-09-19", allDay: true, job: expect.objectContaining({ kind: "install" }) }),
    ]);
  });

  it("merges Outlook events with their jobs, and greys the rest", async () => {
    enabled.mockReturnValue(true);
    graphJson.mockResolvedValue({ value: [
      { id: "e1", changeKey: "c", subject: "Visit · Dana Reyes", isAllDay: false,
        start: { dateTime: "2026-09-17T10:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-17T11:00:00.0000000", timeZone: PST } },
      { id: "e2", changeKey: "c", subject: "Dentist", isAllDay: false,
        start: { dateTime: "2026-09-17T08:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-17T09:00:00.0000000", timeZone: PST } },
    ] });
    sql.mockResolvedValueOnce([]) // tracker rows
      .mockResolvedValueOnce([{ event_id: "e1", kind: "visit", id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked" }]);
    const result = await week.getWeek(undefined, NOW);
    expect(result.source).toBe("outlook");
    expect(result.notice).toBeNull();
    expect(result.items.map((i) => i.title)).toEqual(["Dentist", "Visit · Dana Reyes"]);
    expect(result.items[0].job).toBeNull();
    expect(result.items[1].job).toMatchObject({ id: ID, kind: "visit" });
    expect(result.items[1].start).toEqual(new Date("2026-09-17T17:00:00Z"));
    expect(String(graphJson.mock.calls[0][0])).toMatch(/^users\/jobs@example.com\/calendar\/calendarView\?startDateTime=2026-09-13T07:00:00.000Z&endDateTime=2026-09-20T07:00:00.000Z/);
  });

  it("falls back to tracker dates when Outlook can't be reached", async () => {
    enabled.mockReturnValue(true);
    graphJson.mockRejectedValue(new Error("down"));
    sql.mockResolvedValueOnce([trackerRow]);
    const result = await week.getWeek(undefined, NOW);
    expect(result.source).toBe("tracker");
    expect(result.notice).toBe("Couldn't reach Outlook, showing tracker dates only.");
  });
});
