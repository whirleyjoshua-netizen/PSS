import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const getWeek = vi.fn();
const getMonth = vi.fn();
vi.mock("@/lib/calendar/week", async () => ({
  ...(await vi.importActual<typeof import("@/lib/calendar/week")>("@/lib/calendar/week")), getWeek, getMonth,
}));
const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const { default: SchedulePage } = await import("@/app/admin/schedule/page");
const { MonthView } = await import("@/app/admin/schedule/MonthView");
const days = ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"];
const monthDays = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
  "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12",
  "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19",
  "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26",
  "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
const open = async (params: Record<string, string> = {}) => render(await SchedulePage({ searchParams: Promise.resolve(params) }));

const NOW = new Date("2026-09-16T19:00:00Z"); // Wed Sep 16, noon in Las Vegas

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(NOW);
  requireAdmin.mockClear();
  getWeek.mockReset().mockResolvedValue({
    days, source: "outlook", notice: null, items: [
      { key: "e1", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T17:00:00Z"), title: "Visit · Dana Reyes",
        job: { id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked", kind: "consultation" } },
      { key: "e2", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T15:00:00Z"), title: "Dentist", job: null },
    ],
  });
  getMonth.mockReset().mockResolvedValue({
    month: "2026-09",
    days: monthDays,
    source: "outlook", notice: null,
    items: [
      { key: "e1", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T17:00:00Z"), title: "Visit · Dana Reyes",
        job: { id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked", kind: "consultation" } },
      { key: "e2", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T15:00:00Z"), title: "Dentist", job: null },
    ],
  });
});

afterEach(() => vi.useRealTimers());

describe("schedule page - week view", () => {
  it("checks the session first and shows the week's range and navigation", async () => {
    await open();
    expect(requireAdmin).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByText("Sep 13 – 19, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /previous week/i })).toHaveAttribute("href", "/admin/schedule?week=2026-09-06");
    expect(screen.getByRole("link", { name: /next week/i })).toHaveAttribute("href", "/admin/schedule?week=2026-09-20");
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute("href", "/admin/schedule");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(7);
  });

  it("has a view switch with Week active and a link to the month view", async () => {
    await open();
    const nav = within(screen.getByRole("navigation", { name: "View" }));
    expect(nav.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Month" })).toHaveAttribute("href", "/admin/schedule?view=month&month=2026-09");
    expect(nav.getByRole("link", { name: "Month" })).not.toHaveAttribute("aria-current");
  });

  it("links job appointments to the job and leaves other appointments as plain text", async () => {
    await open();
    const thursday = within(screen.getByRole("listitem", { name: /thu 17/i }));
    expect(thursday.getByRole("link", { name: /dana reyes/i })).toHaveAttribute("href", `/admin/jobs/${ID}`);
    expect(thursday.getByText(/10:00 AM/)).toBeInTheDocument();
    expect(thursday.getByText("Dentist")).toBeInTheDocument();
    expect(thursday.queryByRole("link", { name: /dentist/i })).toBeNull();
  });

  it("explains when it is showing tracker dates only", async () => {
    getWeek.mockResolvedValue({ days, source: "tracker", notice: "Outlook isn't connected yet.", items: [] });
    await open();
    expect(screen.getByRole("status")).toHaveTextContent("Outlook isn't connected yet.");
    expect(screen.getByText("Nothing scheduled this week.")).toBeInTheDocument();
  });

  it("passes the week parameter through", async () => {
    await open({ week: "2026-10-01" });
    expect(getWeek).toHaveBeenCalledWith("2026-10-01", NOW);
  });

  it("treats an unrecognized view value as the week view", async () => {
    await open({ view: "agenda" });
    expect(screen.getByRole("heading", { level: 1, name: "Schedule" })).toBeInTheDocument();
    expect(getWeek).toHaveBeenCalled();
  });
});

describe("schedule page - month view", () => {
  it("renders the month label and the 7 day headers, with the switch pointing back to the week", async () => {
    await open({ view: "month" });
    expect(getMonth).toHaveBeenCalledWith(undefined, NOW);
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    for (const name of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    const nav = within(screen.getByRole("navigation", { name: "View" }));
    expect(nav.getByRole("link", { name: "Month" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Week" })).toHaveAttribute("href", "/admin/schedule?week=2026-09-16");
  });

  it("has months navigation that drops the day", async () => {
    await open({ view: "month", month: "2026-09", day: "2026-09-17" });
    const nav = within(screen.getByRole("navigation", { name: "Months" }));
    expect(nav.getByRole("link", { name: /previous month/i })).toHaveAttribute("href", "/admin/schedule?view=month&month=2026-08");
    expect(nav.getByRole("link", { name: /next month/i })).toHaveAttribute("href", "/admin/schedule?view=month&month=2026-10");
    expect(nav.getByRole("link", { name: "This month" })).toHaveAttribute("href", "/admin/schedule?view=month");
  });

  it("shows a cell with up to 3 lines plus a +N more line", async () => {
    getMonth.mockResolvedValue({
      month: "2026-09",
      days: ["2026-09-17"],
      source: "outlook", notice: null,
      items: [
        { key: "e1", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T15:00:00Z"), title: "One", job: null },
        { key: "e2", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T16:00:00Z"), title: "Two", job: null },
        { key: "e3", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T17:00:00Z"), title: "Three", job: null },
        { key: "e4", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T18:00:00Z"), title: "Four", job: null },
      ],
    });
    await open({ view: "month" });
    const cell = screen.getByRole("link", { name: /thu, sep 17/i });
    expect(within(cell).getByText("+1 more")).toBeInTheDocument();
    expect(within(cell).getByText(/8:00 AM · One/)).toBeInTheDocument();
    expect(within(cell).queryByText(/Four/)).toBeNull();
  });

  it("shows the phone count text", async () => {
    await open({ view: "month" });
    const cell = screen.getByRole("link", { name: /thu, sep 17/i });
    expect(within(cell).getByText("2 booked")).toBeInTheDocument();
  });

  it("selects a day via &day= and shows the day section with a job link", async () => {
    await open({ view: "month", day: "2026-09-17" });
    const section = screen.getByRole("region", { name: "Thursday, September 17" });
    expect(within(section).getByRole("link", { name: /dana reyes/i })).toHaveAttribute("href", `/admin/jobs/${ID}`);
    const cell = screen.getByRole("link", { name: /thu, sep 17/i });
    expect(cell).toHaveAttribute("aria-current", "date");
  });

  it("selects today by default in the current month", async () => {
    await open({ view: "month" });
    expect(screen.getByRole("heading", { level: 2, name: "Wednesday, September 16" })).toBeInTheDocument();
  });

  it("selects nothing by default in a different month", async () => {
    getMonth.mockResolvedValue({ month: "2026-10", days: ["2026-10-01"], source: "outlook", notice: null, items: [] });
    await open({ view: "month", month: "2026-10" });
    expect(screen.getByText("Pick a day to see its appointments.")).toBeInTheDocument();
  });

  it("shows 'Nothing scheduled this month.' when the month is empty", async () => {
    getMonth.mockResolvedValue({ month: "2026-09", days: ["2026-09-17"], source: "outlook", notice: null, items: [] });
    await open({ view: "month" });
    expect(screen.getByText("Nothing scheduled this month.")).toBeInTheDocument();
  });

  it("passes an invalid month value straight through to getMonth (the real fallback is in monthGrid's own tests)", async () => {
    await open({ view: "month", month: "nope" });
    expect(getMonth).toHaveBeenCalledWith("nope", NOW);
  });

  it("shows 'Nothing booked this day.' for a selected day with no items", async () => {
    getMonth.mockResolvedValue({ month: "2026-09", days: ["2026-09-20"], source: "outlook", notice: null, items: [] });
    await open({ view: "month", day: "2026-09-20" });
    expect(screen.getByText("Nothing booked this day.")).toBeInTheDocument();
  });
});

describe("MonthView (direct render)", () => {
  const baseProps = { month: "2026-09", days: monthDays, notice: null, now: NOW };

  it("truncates cell lines and keeps cells from overflowing", () => {
    render(
      <MonthView
        {...baseProps}
        items={[
          { key: "e1", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T15:00:00Z"), end: null,
            title: "A very long unbreakable Outlook subject line that should never widen the grid", job: null },
        ]}
      />,
    );
    const cell = screen.getByRole("link", { name: /thu, sep 17/i });
    expect(cell.className).toMatch(/\bmin-w-0\b/);
    expect(cell.className).toMatch(/\boverflow-hidden\b/);
    const line = within(cell).getByText(/very long unbreakable/);
    expect(line.className).toMatch(/\btruncate\b/);
  });

  it("renders nothing scheduled when there are no items", () => {
    render(<MonthView {...baseProps} items={[]} />);
    expect(screen.getByText("Nothing scheduled this month.")).toBeInTheDocument();
  });

  it("counts only items on the displayed days", () => {
    render(
      <MonthView
        {...baseProps}
        items={[{ key: "x", day: "2026-11-02", allDay: true, start: null, end: null, title: "Elsewhere", job: null }]}
      />,
    );
    expect(screen.getByText("Nothing scheduled this month.")).toBeInTheDocument();
  });
});

describe("multi-day timed events", () => {
  // Sun Sep 13 9:00 AM to Tue Sep 15 10:00 AM in Las Vegas; this is Monday's copy.
  const middle = { key: "long:2026-09-14", day: "2026-09-14", allDay: false,
    start: new Date("2026-09-13T16:00:00Z"), end: new Date("2026-09-15T17:00:00Z"), title: "Long job", job: null };

  it("dates both ends on a week card for a middle-day copy", async () => {
    const { WeekView } = await import("@/app/admin/schedule/WeekView");
    render(<WeekView days={days} notice={null} now={NOW} items={[middle]} />);
    const monday = within(screen.getByRole("listitem", { name: /mon 14/i }));
    expect(monday.getByText("Sun 9:00 AM – Tue 10:00 AM")).toBeInTheDocument();
  });

  it("shows 'Continues' on a later-day month cell line but the full span in the day list", () => {
    render(<MonthView month="2026-09" days={monthDays} notice={null} now={NOW} day="2026-09-14" items={[middle]} />);
    const cell = screen.getByRole("link", { name: /mon, sep 14/i });
    expect(within(cell).getByText("Continues · Long job")).toBeInTheDocument();
    const section = within(screen.getByRole("region", { name: "Monday, September 14" }));
    expect(section.getByText("Sun 9:00 AM – Tue 10:00 AM")).toBeInTheDocument();
  });
});

describe("WeekView (direct render)", () => {
  it("counts only items on the displayed days", async () => {
    const { WeekView } = await import("@/app/admin/schedule/WeekView");
    render(
      <WeekView
        days={days} notice={null} now={NOW}
        items={[{ key: "x", day: "2026-09-12", allDay: true, start: null, end: null, title: "Last week", job: null }]}
      />,
    );
    expect(screen.getByText("Nothing scheduled this week.")).toBeInTheDocument();
  });
});
