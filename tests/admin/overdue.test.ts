import { describe, it, expect } from "vitest";
import { OVERDUE_DAYS, daysInStage, isOverdue } from "@/lib/admin/overdue";

const DAY = 86_400_000;
const NOW = new Date("2026-09-20T18:00:00Z"); // 11 a.m. Sep 20 in Las Vegas
const since = (days: number) => new Date(NOW.getTime() - days * DAY);
const job = (status: string, days: number, visitAt: Date | null = null, lastContactAt: Date | null = null) =>
  ({ status, stageChangedAt: since(days), visitAt, lastContactAt }) as Parameters<typeof isOverdue>[0];

describe("daysInStage", () => {
  it("counts whole days and never goes below zero", () => {
    expect(daysInStage(since(3.9), NOW)).toBe(3);
    expect(daysInStage(new Date(NOW.getTime() + DAY), NOW)).toBe(0);
  });
});

describe("isOverdue", () => {
  it.each([
    ["quoted", 7], ["sold", 3], ["ordered", 21],
  ])("%s is overdue only after %i days", (status, limit) => {
    expect(OVERDUE_DAYS[status as keyof typeof OVERDUE_DAYS]).toBe(limit);
    expect(isOverdue(job(status, limit), NOW)).toBe(false);
    expect(isOverdue(job(status, limit + 1), NOW)).toBe(true);
  });

  it.each(["installed", "lost"])("%s is never overdue", (status) => {
    expect(isOverdue(job(status, 400), NOW)).toBe(false);
  });

  it("a booked visit is overdue from the Las Vegas day after the visit", () => {
    // Visit 4 p.m. Sep 19 Las Vegas time (23:00 UTC): overdue on Sep 20.
    expect(isOverdue(job("visit_booked", 5, new Date("2026-09-19T23:00:00Z")), NOW)).toBe(true);
    // Visit 8 p.m. Sep 20 Las Vegas time, which is already Sep 21 in UTC: not overdue.
    expect(isOverdue(job("visit_booked", 5, new Date("2026-09-21T03:00:00Z")), NOW)).toBe(false);
    // Visit earlier the same Las Vegas day: not overdue yet.
    expect(isOverdue(job("visit_booked", 5, new Date("2026-09-20T15:00:00Z")), NOW)).toBe(false);
  });

  it("a booked visit with no date is never overdue", () => {
    expect(isOverdue(job("visit_booked", 60, null), NOW)).toBe(false);
  });

  it("a new lead is overdue after a day only when nothing was logged since it came in", () => {
    expect(OVERDUE_DAYS.new).toBe(1);
    expect(isOverdue(job("new", 1), NOW)).toBe(false);
    expect(isOverdue(job("new", 2), NOW)).toBe(true);
    expect(isOverdue(job("new", 2, null, since(1)), NOW)).toBe(false);
    expect(isOverdue(job("new", 2, null, since(3)), NOW)).toBe(true); // contact before it entered New does not count
  });
});
