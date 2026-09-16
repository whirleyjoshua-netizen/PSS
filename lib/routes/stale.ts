import type { DayStop } from "./types";

/** One saved route_stops row. savedCount is the stops plus didn't-fit appointments when the day was saved. */
export type SavedStopRow = { appointmentId: string; savedAt: string; routeDate: string; savedCount: number };

const hasCoordinates = (stop: DayStop) => stop.lat !== null && stop.lng !== null;

/**
 * Computed, never stored: see spec §3 "Out of date". The day is out of date when
 * (a) an appointment with coordinates changed after the save,
 * (b) a saved stop's appointment is no longer on that date, or
 * (c) the number of that date's appointments with coordinates differs from the saved count.
 * A job without coordinates (Needs address) never makes the day out of date.
 */
export function isRouteStale(saved: SavedStopRow[], day: DayStop[], date: string): boolean {
  if (saved.length === 0) return false;
  const savedAt = saved.map((s) => s.savedAt).sort().at(-1)!;
  const routable = day.filter(hasCoordinates);
  if (routable.some((s) => s.updatedAt > savedAt)) return true;
  const onDay = new Set(day.map((s) => s.appointmentId));
  if (saved.some((s) => s.routeDate !== date || !onDay.has(s.appointmentId))) return true;
  const savedCount = Math.max(...saved.map((s) => s.savedCount));
  return routable.length !== savedCount;
}
