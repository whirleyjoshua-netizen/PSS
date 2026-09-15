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

describe("getDay", () => {
  const trackerRow = { id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked",
    visit_at: "2026-09-17T17:00:00Z", install_on: "2026-09-19" };

  it("rejects an invalid date", async () => {
    await expect(week.getDay("nope")).rejects.toThrow("Invalid date");
    await expect(week.getDay("2026-13-45")).rejects.toThrow("Invalid date");
  });

  it("returns only tracker items for that day, with visit end times", async () => {
    sql.mockResolvedValueOnce([trackerRow]);
    const result = await week.getDay("2026-09-17");
    expect(result.date).toBe("2026-09-17");
    expect(result.source).toBe("tracker");
    expect(result.notice).toBe("Outlook isn't connected yet.");
    expect(result.items).toEqual([
      expect.objectContaining({ day: "2026-09-17", allDay: false, end: new Date("2026-09-17T18:00:00Z") }),
    ]);
  });

  it("uses Outlook events with their end time for that day, and windows the request to that one day", async () => {
    enabled.mockReturnValue(true);
    graphJson.mockResolvedValue({ value: [
      { id: "e1", changeKey: "c", subject: "Visit · Dana Reyes", isAllDay: false,
        start: { dateTime: "2026-09-17T10:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-17T11:00:00.0000000", timeZone: PST } },
    ] });
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await week.getDay("2026-09-17");
    expect(result.source).toBe("outlook");
    expect(result.items[0].end).toEqual(new Date("2026-09-17T18:00:00Z"));
    expect(String(graphJson.mock.calls[0][0])).toMatch(/^users\/jobs@example.com\/calendar\/calendarView\?startDateTime=2026-09-17T07:00:00.000Z&endDateTime=2026-09-18T07:00:00.000Z/);
  });

  it("only returns items whose day matches", async () => {
    sql.mockResolvedValueOnce([trackerRow]);
    const result = await week.getDay("2026-09-19");
    expect(result.items).toEqual([expect.objectContaining({ day: "2026-09-19", allDay: true })]);
  });
});

describe("monthGrid", () => {
  it("Sep 2026 runs from 2026-08-30 to 2026-10-03 (35 days)", () => {
    const { month, days } = week.monthGrid("2026-09", NOW);
    expect(month).toBe("2026-09");
    expect(days[0]).toBe("2026-08-30");
    expect(days[days.length - 1]).toBe("2026-10-03");
    expect(days).toHaveLength(35);
  });

  it("Feb 2026 runs from 2026-02-01 to 2026-02-28 (28 days)", () => {
    const { days } = week.monthGrid("2026-02", NOW);
    expect(days[0]).toBe("2026-02-01");
    expect(days[days.length - 1]).toBe("2026-02-28");
    expect(days).toHaveLength(28);
  });

  it("a 42-day month starts Sun Jul 26 and ends Sat Sep 5", () => {
    const { days } = week.monthGrid("2026-08", NOW);
    expect(days[0]).toBe("2026-07-26");
    expect(days[days.length - 1]).toBe("2026-09-05");
    expect(days).toHaveLength(42);
  });

  it("handles a leap February", () => {
    const { days } = week.monthGrid("2028-02", NOW);
    expect(days[0]).toBe("2028-01-30");
    expect(days[days.length - 1]).toBe("2028-03-04");
    expect(days.some((d) => d === "2028-02-29")).toBe(true);
  });

  it("falls back to the current Las Vegas month on invalid input", () => {
    // 04:00Z Oct 1 is still Sep 30 evening in Las Vegas.
    for (const bad of ["2026-13", "nope", ""]) {
      const { month } = week.monthGrid(bad, new Date("2026-10-01T04:00:00Z"));
      expect(month).toBe("2026-09");
    }
  });
});

describe("monthLabel", () => {
  it("formats a YYYY-MM as a month name and year", () => {
    expect(week.monthLabel("2026-09")).toBe("September 2026");
  });
});

describe("getMonth", () => {
  it("passes the month's grid range to Graph and merges paged results", async () => {
    enabled.mockReturnValue(true);
    graphJson.mockResolvedValueOnce({
      value: [{ id: "e1", changeKey: "c", subject: "Page 1", isAllDay: false,
        start: { dateTime: "2026-09-17T10:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-17T11:00:00.0000000", timeZone: PST } }],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
    }).mockResolvedValueOnce({
      value: [{ id: "e2", changeKey: "c", subject: "Page 2", isAllDay: false,
        start: { dateTime: "2026-09-18T10:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-18T11:00:00.0000000", timeZone: PST } }],
    });
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await week.getMonth("2026-09", NOW);
    expect(result.month).toBe("2026-09");
    expect(result.days[0]).toBe("2026-08-30");
    expect(result.items.map((i) => i.title).sort()).toEqual(["Page 1", "Page 2"]);
    expect(graphJson.mock.calls[1][0]).toBe("https://graph.microsoft.com/v1.0/next-page");
    expect(String(graphJson.mock.calls[0][0])).toMatch(/^users\/jobs@example.com\/calendar\/calendarView\?startDateTime=2026-08-30T07:00:00.000Z&endDateTime=2026-10-04T07:00:00.000Z/);
  });

  it("stops paging Graph at 10 pages even when more remain", async () => {
    enabled.mockReturnValue(true);
    for (let i = 0; i < 11; i++) {
      graphJson.mockResolvedValueOnce({
        value: [{ id: `e${i}`, changeKey: "c", subject: `Page ${i}`, isAllDay: false,
          start: { dateTime: "2026-09-17T10:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-17T11:00:00.0000000", timeZone: PST } }],
        "@odata.nextLink": `https://graph.microsoft.com/v1.0/page-${i + 1}`,
      });
    }
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await week.getMonth("2026-09", NOW);
    expect(graphJson).toHaveBeenCalledTimes(10);
    expect(result.items).toHaveLength(10);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

  describe("events covering more than one day", () => {
    const outlook = (events: unknown[]) => {
      enabled.mockReturnValue(true);
      graphJson.mockResolvedValue({ value: events });
      sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    };

    it("shows a 3-day all-day event on all 3 days, each copy with its own key", async () => {
      outlook([{ id: "trip", changeKey: "c", subject: "Trip", isAllDay: true,
        start: { dateTime: "2026-09-15T00:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-18T00:00:00.0000000", timeZone: PST } }]);
      const result = await week.getWeek(undefined, NOW);
      expect(result.items.map((i) => [i.key, i.day])).toEqual([
        ["trip:2026-09-15", "2026-09-15"], ["trip:2026-09-16", "2026-09-16"], ["trip:2026-09-17", "2026-09-17"],
      ]);
    });

    it("shows an event that started the week before on this week's first day, keeping its real times", async () => {
      outlook([{ id: "long", changeKey: "c", subject: "Long job", isAllDay: false,
        start: { dateTime: "2026-09-11T09:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-13T10:00:00.0000000", timeZone: PST } }]);
      const result = await week.getWeek(undefined, NOW);
      expect(result.items).toEqual([expect.objectContaining({
        key: "long:2026-09-13", day: "2026-09-13",
        start: new Date("2026-09-11T16:00:00Z"), end: new Date("2026-09-13T17:00:00Z"),
      })]);
    });

    it("keeps an event ending exactly at midnight on one day", async () => {
      outlook([{ id: "late", changeKey: "c", subject: "Late", isAllDay: false,
        start: { dateTime: "2026-09-15T22:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-16T00:00:00.0000000", timeZone: PST } }]);
      const result = await week.getWeek(undefined, NOW);
      expect(result.items.map((i) => i.day)).toEqual(["2026-09-15"]);
    });

    it("never returns copies for days outside the displayed range", async () => {
      outlook([{ id: "big", changeKey: "c", subject: "Big", isAllDay: true,
        start: { dateTime: "2026-09-01T00:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-10-10T00:00:00.0000000", timeZone: PST } }]);
      const result = await week.getWeek(undefined, NOW);
      expect(result.items.map((i) => i.day)).toEqual(result.days);
    });

    it("getDay includes a multi-day event on a middle day", async () => {
      outlook([{ id: "trip", changeKey: "c", subject: "Trip", isAllDay: true,
        start: { dateTime: "2026-09-15T00:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-18T00:00:00.0000000", timeZone: PST } }]);
      const result = await week.getDay("2026-09-16");
      expect(result.items).toEqual([expect.objectContaining({ key: "trip:2026-09-16", day: "2026-09-16", allDay: true })]);
    });
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
