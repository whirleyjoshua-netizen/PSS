import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ScheduleCard } from "@/app/admin/schedule/ScheduleCard";
import type { ScheduleItem } from "@/lib/calendar/week";

const item: ScheduleItem = {
  key: "job1:install", day: "2026-09-24", allDay: false,
  start: new Date("2026-09-24T16:00:00Z"), end: new Date("2026-09-24T19:00:00Z"), title: "Install · Dana Reyes",
  job: { id: "job1", name: "Dana Reyes", city: "Henderson", status: "ordered", kind: "install" },
};

describe("ScheduleCard route notes", () => {
  it("shows the arrival window and the planned route time", () => {
    render(<ScheduleCard item={{ ...item, note: { window: "8:00 – 10:00 AM", plannedArrival: new Date("2026-09-24T16:10:00Z") } }} />);
    expect(screen.getByText("Arrives 8:00 – 10:00 AM")).toBeTruthy();
    expect(screen.getByText("Route: 9:10 AM")).toBeTruthy();
  });

  it("shows only the window before a route is saved", () => {
    render(<ScheduleCard item={{ ...item, note: { window: "8:00 – 10:00 AM", plannedArrival: null } }} />);
    expect(screen.getByText("Arrives 8:00 – 10:00 AM")).toBeTruthy();
    expect(screen.queryByText(/Route:/)).toBeNull();
  });

  it("shows neither without a note", () => {
    const { container } = render(<ScheduleCard item={item} />);
    expect(screen.queryByText(/Arrives/)).toBeNull();
    expect(screen.queryByText(/Route:/)).toBeNull();
    expect(container.querySelectorAll("a > span")).toHaveLength(3);
  });
});
