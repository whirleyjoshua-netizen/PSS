import { describe, it, expect } from "vitest";
import { isRouteStale, type SavedStopRow } from "@/lib/routes/stale";
import type { DayStop } from "@/lib/routes/types";

const D = "2026-09-24";
const stop = (id: string, updatedAt: string, coords = true): DayStop => ({
  appointmentId: id, jobId: "j", name: "n", address: "a", city: "c", kind: "install", startsAt: "", allDay: true,
  confirmed: true, windowStart: null, windowEnd: null, durationMinutes: 60,
  lat: coords ? 1 : null, lng: coords ? 1 : null, assignedTo: null, updatedAt,
});
const saved = (id: string, savedAt = "2026-09-22T12:00:00.000Z", routeDate = D) => ({ appointmentId: id, savedAt, routeDate });
/** Every row of one save carries the same count; `extra` adds didn't-fit appointments to it. */
const rows = (...items: ReturnType<typeof saved>[]): SavedStopRow[] => items.map((r) => ({ ...r, savedCount: items.length }));
const withCount = (list: SavedStopRow[], savedCount: number) => list.map((r) => ({ ...r, savedCount }));
const OLD = "2026-09-21T00:00:00.000Z";

describe("isRouteStale", () => {
  it("is fresh when every appointment is saved and none changed since", () => {
    expect(isRouteStale(rows(saved("a"), saved("b")), [stop("a", OLD), stop("b", "2026-09-22T12:00:00.000Z")])).toBe(false);
  });

  it("is stale when an appointment changed after the save", () => {
    expect(isRouteStale(rows(saved("a")), [stop("a", "2026-09-22T12:00:01.000Z")])).toBe(true);
  });

  it("is stale when a didn't-fit appointment changed after the save", () => {
    expect(isRouteStale(withCount(rows(saved("a")), 2), [stop("a", OLD), stop("skip", "2026-09-23T00:00:00.000Z")])).toBe(true);
  });

  it("is stale when a saved stop's appointment moved to another day", () => {
    // The count still matches (a new routable appointment replaced it), so only the move catches it.
    expect(isRouteStale(rows(saved("a"), saved("b")), [stop("a", OLD), stop("c", OLD)])).toBe(true);
  });

  it("is stale when the day has a new appointment with coordinates", () => {
    expect(isRouteStale(rows(saved("a")), [stop("a", OLD), stop("new", OLD)])).toBe(true);
  });

  it("is stale when a stop was removed since the save (a cancelled appointment cascades away)", () => {
    expect(isRouteStale(withCount(rows(saved("a")), 2), [stop("a", OLD)])).toBe(true);
  });

  it("is fresh when the saved count includes the day's didn't-fit appointments", () => {
    expect(isRouteStale(withCount(rows(saved("a")), 2), [stop("a", OLD), stop("skip", OLD)])).toBe(false);
  });

  it("never goes stale over a Needs-address job, even a new or edited one", () => {
    expect(isRouteStale(rows(saved("a")), [stop("a", OLD), stop("noaddr", "2026-09-23T00:00:00.000Z", false)])).toBe(false);
  });

  it("uses the latest save time across the day's stops", () => {
    expect(isRouteStale(rows(saved("a", "2026-09-22T12:00:00.000Z"), saved("b", "2026-09-23T12:00:00.000Z")),
      [stop("a", "2026-09-23T00:00:00.000Z"), stop("b", OLD)])).toBe(false);
  });

  it("is not stale when nothing was ever saved", () => {
    expect(isRouteStale([], [stop("a", OLD)])).toBe(false);
  });
});
