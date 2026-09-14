import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const getWeek = vi.fn();
vi.mock("@/lib/calendar/week", async () => ({
  ...(await vi.importActual<typeof import("@/lib/calendar/week")>("@/lib/calendar/week")), getWeek,
}));
const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const { default: SchedulePage } = await import("@/app/admin/schedule/page");
const days = ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"];
const open = async (week?: string) => render(await SchedulePage({ searchParams: Promise.resolve(week ? { week } : {}) }));

beforeEach(() => {
  requireAdmin.mockClear();
  getWeek.mockReset().mockResolvedValue({
    days, source: "outlook", notice: null, items: [
      { key: "e1", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T17:00:00Z"), title: "Visit · Dana Reyes",
        job: { id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked", kind: "visit" } },
      { key: "e2", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T15:00:00Z"), title: "Dentist", job: null },
    ],
  });
});

describe("schedule page", () => {
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

  it("links job appointments to the job and leaves other appointments as plain text", async () => {
    await open();
    const thursday = within(screen.getByRole("listitem", { name: /thu 17/i }));
    expect(thursday.getByRole("link", { name: /dana reyes/i })).toHaveAttribute("href", `/admin?job=${ID}`);
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
    await open("2026-10-01");
    expect(getWeek).toHaveBeenCalledWith("2026-10-01");
  });
});
