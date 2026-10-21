import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const enabled = vi.fn(() => true);
vi.mock("@/lib/calendar/config", () => ({ calendarConfig: () => (enabled() ? { mailbox: "support@example.com" } : null) }));
const graphJson = vi.fn();
vi.mock("@/lib/calendar/graph", () => ({ graphJson }));
const mirrorToJob = vi.fn();
vi.mock("@/lib/admin/appointments", () => ({ mirrorToJob }));
const setStage = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ setStage }));

const { availableDays, bookConsultation } = await import("@/lib/booking/book");

const NOW = new Date("2026-10-20T22:00:00Z"); // Tue Oct 20, 3 PM in Las Vegas
const TWO = new Date("2026-10-21T21:00:00Z"); // Wed Oct 21, 2 PM
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const event = (start: string, end: string, extra: Record<string, unknown> = {}) => ({
  start: { dateTime: `${start}:00.0000000` }, end: { dateTime: `${end}:00.0000000` }, showAs: "busy", ...extra,
});
const times = (days: Awaited<ReturnType<typeof availableDays>>, date: string) =>
  days.find((d) => d.date === date)?.slots.map((s) => s.toISOString()) ?? [];

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  graphJson.mockReset().mockResolvedValue({ value: [] });
  enabled.mockReturnValue(true);
  mirrorToJob.mockReset().mockResolvedValue(undefined);
  setStage.mockReset().mockResolvedValue(true);
});

describe("availableDays", () => {
  it("offers nothing when Outlook isn't connected", async () => {
    enabled.mockReturnValue(false);
    await expect(availableDays(NOW)).rejects.toThrow();
  });

  it("reads Las Vegas wall times from Outlook and closes the slots they touch", async () => {
    graphJson.mockResolvedValue({ value: [event("2026-10-21T12:00", "2026-10-21T13:00")] });
    const days = await availableDays(NOW);
    expect(graphJson.mock.calls[0][0]).toContain("users/support@example.com/calendar/calendarView?");
    expect(graphJson.mock.calls[0][0]).toContain("showAs");
    // Noon is taken and 1:30 is the earliest after the drive, so the first open hour is 2.
    expect(times(days, "2026-10-21")[0]).toBe(TWO.toISOString());
  });

  it("ignores Free events and all-day events unless marked Away", async () => {
    graphJson.mockResolvedValue({ value: [
      event("2026-10-21T12:00", "2026-10-21T18:00", { showAs: "free" }),
      event("2026-10-22T00:00", "2026-10-23T00:00", { isAllDay: true }),
      event("2026-10-23T00:00", "2026-10-24T00:00", { isAllDay: true, showAs: "oof" }),
    ] });
    const days = await availableDays(NOW);
    expect(times(days, "2026-10-21")).toHaveLength(5);
    expect(times(days, "2026-10-22")).toHaveLength(5);
    expect(times(days, "2026-10-23")).toHaveLength(0);
  });

  it("counts the tracker's own appointments for their real length", async () => {
    // A 90-minute visit at 2 PM: the next start is 4.
    sql.mockResolvedValue([{ starts_at: "2026-10-21T21:00:00Z", ends_at: "2026-10-21T22:30:00Z" }]);
    const days = await availableDays(NOW);
    const labels = times(days, "2026-10-21");
    expect(labels).toContain("2026-10-21T19:00:00.000Z"); // noon
    expect(labels).not.toContain("2026-10-21T20:00:00.000Z"); // 1 PM would run into it
    expect(labels).not.toContain("2026-10-21T22:00:00.000Z"); // 3 PM
    expect(labels).toContain("2026-10-21T23:00:00.000Z"); // 4 PM
    expect(text(sql.mock.calls[0])).toContain("where not all_day");
  });
});

describe("bookConsultation", () => {
  it("refuses a time that was never offered, before reading anything", async () => {
    expect(await bookConsultation(LEAD, new Date("2026-10-21T17:00:00Z"), NOW)).toEqual({ status: "taken" }); // 10 AM
    expect(graphJson).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("refuses a time Outlook has since filled", async () => {
    graphJson.mockResolvedValue({ value: [event("2026-10-21T14:30", "2026-10-21T15:00")] });
    expect(await bookConsultation(LEAD, TWO, NOW)).toEqual({ status: "taken" });
    expect(sql).toHaveBeenCalledTimes(1); // the tracker read, never the insert
  });

  it("is taken when the insert's own check finds a clash", async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await bookConsultation(LEAD, TWO, NOW)).toEqual({ status: "taken" });
    expect(mirrorToJob).not.toHaveBeenCalled();
    expect(setStage).not.toHaveBeenCalled();
  });

  it("books it confirmed, logs it, mirrors it and moves the lead to Appointment booked", async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "appt-1", lead_id: LEAD, starts_at: TWO.toISOString(), confirmed_at: NOW.toISOString() },
    ]);
    const result = await bookConsultation(LEAD, TWO, NOW);
    expect(result).toMatchObject({ status: "booked", appointment: {
      id: "appt-1", jobId: LEAD, kind: "consultation", startsAt: TWO, allDay: false, confirmedBy: "website", durationMinutes: 90,
    } });
    const insert = sql.mock.calls[1];
    const statement = text(insert);
    expect(statement).toContain("insert into appointments (lead_id, kind, starts_at, all_day, duration_minutes, confirmed_at, confirmed_by)");
    expect(statement).toContain("'consultation', ?::timestamptz, false, ?::integer, now(), 'website'");
    expect(statement).toContain("not exists");
    expect(statement).toContain("on conflict (lead_id, kind) do nothing");
    expect(statement).toContain("insert into job_events (lead_id, actor, kind, body) select lead_id, 'customer', 'edit'");
    expect(insert).toContain("Consultation booked online for Wed, Oct 21, 2:00 PM");
    expect(insert).toContain(LEAD);
    expect(mirrorToJob).toHaveBeenCalledWith(LEAD);
    expect(setStage).toHaveBeenCalledWith(LEAD, "visit_booked", "customer", { body: "Booked a consultation online" });
  });
});
