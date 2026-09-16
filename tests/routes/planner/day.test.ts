import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DayStop, RoutePlan } from "@/lib/routes/types";

const sql = Object.assign(vi.fn(), { query: vi.fn(), transaction: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const geocodeLead = vi.fn();
vi.mock("@/lib/routes/geocode", () => ({ geocodeLead }));
vi.mock("@/lib/routes/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/routes/settings")>("@/lib/routes/settings");
  return { ...actual, getRouteSettings: async () => actual.DEFAULT_ROUTE_SETTINGS };
});
const { isRouteDay, loadDay, listInstallers, loadSavedPlan, saveRoutePlan, routeNotes, DIDNT_FIT_REASON } =
  await import("@/lib/routes/day");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const flat = (s: string) => s.replace(/\s+/g, " ");
const D = "2026-09-24";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const M1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const row = (over: Record<string, unknown> = {}) => ({
  id: A, lead_id: "L1", kind: "install", starts_at: new Date("2026-09-24T16:00:00Z"), all_day: true,
  confirmed_at: null, updated_at: new Date("2026-09-20T00:00:00Z"), window_start: "08:30:00", window_end: "10:00:00",
  duration_minutes: null, name: "Ann", address: "1 Main", city: "Las Vegas", lat: 36.1, lng: -115.1,
  geocode_status: "ok", assigned_to: null, ...over,
});
const dayStop = (id: string, over: Partial<DayStop> = {}): DayStop => ({
  appointmentId: id, jobId: "j", name: "n", address: "a", city: "c", kind: "install", startsAt: "", allDay: true,
  confirmed: true, windowStart: null, windowEnd: null, durationMinutes: 60, lat: 1, lng: 1, assignedTo: null,
  updatedAt: "2026-09-20T00:00:00.000Z", ...over,
});

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockImplementation((q: string, params: unknown[]) => ({ q, params }));
  sql.transaction.mockReset();
  geocodeLead.mockReset();
});

describe("isRouteDay", () => {
  it("accepts only real calendar days", () => {
    expect(isRouteDay("2026-09-24")).toBe(true);
    expect(isRouteDay("2026-02-30")).toBe(false);
    expect(isRouteDay("x")).toBe(false);
    expect(isRouteDay(undefined)).toBe(false);
  });
});

describe("loadDay", () => {
  it("reads the Las Vegas day and maps each appointment", async () => {
    sql.mockResolvedValue([row()]);
    const [stop] = await loadDay(D);
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("from appointments a join leads l");
    expect(q).toContain("l.status <> 'lost'");
    expect(q).toContain("a.starts_at >= ? and a.starts_at < ?");
    for (const col of ["l.lat", "l.lng", "l.geocode_status", "l.assigned_to", "a.window_start::text",
      "a.window_end::text", "a.duration_minutes", "a.updated_at"]) expect(q).toContain(col);
    expect((sql.mock.calls[0][1] as Date).toISOString()).toBe("2026-09-24T07:00:00.000Z");
    expect((sql.mock.calls[0][2] as Date).toISOString()).toBe("2026-09-25T07:00:00.000Z");
    expect(stop).toEqual({
      appointmentId: A, jobId: "L1", name: "Ann", address: "1 Main", city: "Las Vegas", kind: "install",
      startsAt: "2026-09-24T16:00:00.000Z", allDay: true, confirmed: false, windowStart: "08:30", windowEnd: "10:00",
      durationMinutes: 240, lat: 36.1, lng: -115.1, assignedTo: null, updatedAt: "2026-09-20T00:00:00.000Z",
    });
  });

  it("re-geocodes errored leads once each, then re-reads; never for not_found", async () => {
    sql.mockResolvedValueOnce([row({ lead_id: "L1", geocode_status: "error" }), row({ id: B, lead_id: "L1", geocode_status: "error" }),
      row({ id: C, lead_id: "L2", geocode_status: "not_found" })]).mockResolvedValueOnce([row()]);
    const day = await loadDay(D);
    expect(geocodeLead.mock.calls).toEqual([["L1"]]);
    expect(sql).toHaveBeenCalledTimes(2);
    expect(day).toHaveLength(1);
  });

  it("does not re-read when nothing errored", async () => {
    sql.mockResolvedValue([row({ geocode_status: "not_found" })]);
    await loadDay(D);
    expect(geocodeLead).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe("listInstallers", () => {
  it("lists installers by name", async () => {
    sql.mockResolvedValue([{ id: M1, name: "Bo" }]);
    expect(await listInstallers()).toEqual([{ id: M1, name: "Bo" }]);
    expect(text(sql.mock.calls[0])).toContain("where role = 'installer' order by lower(name)");
  });
});

describe("loadSavedPlan", () => {
  const saved = (over: Record<string, unknown>) => ({
    appointment_id: A, team_member_id: M1, position: 1, planned_arrival: new Date("2026-09-24T16:00:00Z"),
    drive_minutes: 10, saved_at: new Date("2026-09-22T12:00:00Z"), saved_count: 3, route_date: D, ...over,
  });

  it("returns null when nothing is saved", async () => {
    expect(await loadSavedPlan(D, [])).toBeNull();
    expect(text(sql.mock.calls[0])).toContain("from route_stops where route_date = ?::date order by team_member_id, position");
  });

  it("groups stops per installer, gives every installer a route and lists routable leftovers as didn't fit", async () => {
    sql.mockResolvedValueOnce([
      saved({}),
      saved({ appointment_id: B, position: 2, drive_minutes: 15, saved_at: new Date("2026-09-22T13:00:00Z") }),
    ]).mockResolvedValueOnce([{ id: M1, name: "Al" }, { id: M2, name: "Bo" }]);
    const day = [dayStop(A), dayStop(B), dayStop(C), dayStop("noaddr", { lat: null, lng: null })];
    const result = await loadSavedPlan(D, day);
    expect(result).toEqual({
      plan: {
        day: D, builtAt: "2026-09-22T13:00:00.000Z",
        routes: [
          { teamMemberId: M1, polyline: null, driveMinutes: 25, stops: [
            { appointmentId: A, arrival: "2026-09-24T16:00:00.000Z", driveMinutes: 10, outsideWindow: false },
            { appointmentId: B, arrival: "2026-09-24T16:00:00.000Z", driveMinutes: 15, outsideWindow: false },
          ] },
          { teamMemberId: M2, polyline: null, driveMinutes: 0, stops: [] },
        ],
        skipped: [{ appointmentId: C, reason: DIDNT_FIT_REASON }],
      },
      savedAt: "2026-09-22T13:00:00.000Z",
      stale: false,
    });
  });

  it("reports stale from the saved rows", async () => {
    sql.mockResolvedValueOnce([saved({ saved_count: 1 })]).mockResolvedValueOnce([]);
    const result = await loadSavedPlan(D, [dayStop(A, { updatedAt: "2026-09-23T00:00:00.000Z" })]);
    expect(result?.stale).toBe(true);
  });
});

describe("saveRoutePlan", () => {
  const plan: RoutePlan = {
    day: D, builtAt: "2026-09-22T12:00:00.000Z",
    routes: [
      { teamMemberId: M1, polyline: null, driveMinutes: 25, stops: [
        { appointmentId: A, arrival: "2026-09-24T16:00:00.000Z", driveMinutes: 10, outsideWindow: false },
        { appointmentId: B, arrival: "2026-09-24T18:00:00.000Z", driveMinutes: 15, outsideWindow: false },
      ] },
      { teamMemberId: M2, polyline: null, driveMinutes: 5, stops: [
        { appointmentId: C, arrival: "2026-09-24T17:00:00.000Z", driveMinutes: 5, outsideWindow: true },
      ] },
    ],
    skipped: [{ appointmentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", reason: "Didn't fit" }],
  };
  const run = async (first: unknown[]) => {
    sql.transaction.mockResolvedValue([first, [{ saved: 3, logged: 1 }]]);
    const result = await saveRoutePlan(plan, "owner@example.com");
    const [queries, opts] = sql.transaction.mock.calls[0] as [{ q: string; params: unknown[] }[], unknown];
    return { result, queries, opts };
  };

  it("runs one transaction: clear the day, then insert, reassign and log, each behind the same guard", async () => {
    const { queries, opts } = await run([{ changed: 0, unknown: 0 }]);
    expect(sql.transaction).toHaveBeenCalledTimes(1);
    expect(sql).not.toHaveBeenCalled();
    expect(queries).toHaveLength(2);
    expect(opts).toEqual({ isolationLevel: "RepeatableRead" });
    const [clear, write] = queries.map((x) => flat(x.q));
    expect(clear).toContain("delete from route_stops where route_date = $6::date and not (select changed or unknown from guard)");
    expect(clear).not.toContain("insert into");
    expect(write).not.toContain("delete from route_stops");
    expect(write).toContain("insert into route_stops (route_date, appointment_id, team_member_id, position, planned_arrival, drive_minutes, saved_count)");
    expect(write).toContain("from input i where not (select changed or unknown from guard)");
    expect(write).toContain("update leads l set assigned_to");
    expect(write).toContain("insert into job_events");
    expect(write).toContain("'edit', 'Assigned to ' || m.name || ' (Installer) by route'");
    for (const q of [clear, write]) {
      expect(q).toContain("jsonb_to_recordset($1::jsonb)");
      expect(q).toContain("d.updated_at > $4::timestamptz");
      expect(q).toContain("l.lat is not null and l.lng is not null");
      expect(q).toContain("(select count(*) from day) <> cardinality($5::uuid[])");
      expect(q).toContain("not (d.id = any($5::uuid[]))");
      expect(q).toContain("p.id not in (select id from day)");
      expect(q).toContain("m.role = 'installer'");
    }
  });

  it("passes the stops in route order with positions per installer, and counts stops plus didn't fit", async () => {
    const { queries } = await run([{ changed: 0, unknown: 0 }]);
    const [clear, write] = queries;
    expect(JSON.parse(clear.params[0] as string)).toEqual([
      { appointment_id: A, team_member_id: M1, position: 1, planned_arrival: "2026-09-24T16:00:00.000Z", drive_minutes: 10 },
      { appointment_id: B, team_member_id: M1, position: 2, planned_arrival: "2026-09-24T18:00:00.000Z", drive_minutes: 15 },
      { appointment_id: C, team_member_id: M2, position: 1, planned_arrival: "2026-09-24T17:00:00.000Z", drive_minutes: 5 },
    ]);
    expect((clear.params[1] as Date).toISOString()).toBe("2026-09-24T07:00:00.000Z");
    expect((clear.params[2] as Date).toISOString()).toBe("2026-09-25T07:00:00.000Z");
    expect(clear.params.slice(3)).toEqual([plan.builtAt, [A, B, C, plan.skipped[0].appointmentId], D]);
    expect(write.params).toEqual([...clear.params, 4, "owner@example.com"]);
  });

  it("maps the guard's answer", async () => {
    expect((await run([{ changed: 1, unknown: 0 }])).result).toBe("changed");
    sql.transaction.mockReset();
    expect((await run([{ changed: 0, unknown: 1 }])).result).toBe("unknown-installer");
    sql.transaction.mockReset();
    expect((await run([{ changed: 0, unknown: 0, cleared: 3 }])).result).toBe("ok");
  });

  it("saves a day whose only extra appointment has no coordinates (guard ignores it)", async () => {
    // The Needs-address appointment is in neither stops nor skipped; the guard's day set excludes it in SQL.
    const { result, queries } = await run([{ changed: 0, unknown: 0 }]);
    expect(result).toBe("ok");
    expect(flat(queries[0].q)).toMatch(/day as \( select .* and l\.lat is not null and l\.lng is not null \)/);
  });
});

describe("routeNotes", () => {
  it("keys notes by lead and kind, joining only the stop saved for the appointment's own Las Vegas date", async () => {
    sql.mockResolvedValue([
      { lead_id: "L1", kind: "install", window_start: "08:00:00", window_end: "10:00:00", planned_arrival: new Date("2026-09-24T16:00:00Z") },
      { lead_id: "L2", kind: "measure", window_start: null, window_end: null, planned_arrival: null },
    ]);
    const notes = await routeNotes(new Date("2026-09-21T07:00:00Z"), new Date("2026-09-28T07:00:00Z"));
    expect(text(sql.mock.calls[0])).toContain(
      "left join route_stops s on s.appointment_id = a.id and s.route_date = (a.starts_at at time zone 'America/Los_Angeles')::date");
    expect(notes.get("L1:install")).toEqual({ windowStart: "08:00", windowEnd: "10:00", plannedArrival: new Date("2026-09-24T16:00:00Z") });
    expect(notes.get("L2:measure")).toEqual({ windowStart: null, windowEnd: null, plannedArrival: null });
  });
});
