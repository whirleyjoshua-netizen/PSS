export type LeadTime = { label: string; minWeeks: number; maxWeeks: number };

/**
 * Calendar dates are held as midnight UTC of the Las Vegas day and formatted in UTC, so adding weeks is plain day
 * arithmetic and the November clock change can never move a date.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayInLasVegas(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

export function installWindow(leadTime: LeadTime, today: Date): { from: Date; to: Date } {
  return {
    from: new Date(today.getTime() + leadTime.minWeeks * 7 * DAY_MS),
    to: new Date(today.getTime() + leadTime.maxWeeks * 7 * DAY_MS),
  };
}

export const formatShortDate = (day: Date) =>
  day.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** `isoDay` is a plain calendar day, e.g. "2026-12-24". */
export const isAfterDay = (day: Date, isoDay: string) => day.getTime() > new Date(`${isoDay}T00:00:00Z`).getTime();

/** "blinds and shades 3–5 weeks, shutters 6–10 weeks": products sharing a range are named together. */
export function leadTimeSummary(leadTimes: LeadTime[]): string {
  const groups = new Map<string, string[]>();
  for (const { label, minWeeks, maxWeeks } of leadTimes) {
    const range = `${minWeeks}–${maxWeeks} weeks`;
    groups.set(range, [...(groups.get(range) ?? []), label.toLowerCase()]);
  }
  return Array.from(groups, ([range, labels]) => `${labels.join(" and ")} ${range}`).join(", ");
}
