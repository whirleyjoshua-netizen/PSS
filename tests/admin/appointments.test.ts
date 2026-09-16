import { describe, it, expect, vi, beforeEach } from "vitest";

// Writes use the tagged template; the module never uses sql.query.
const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const appointments = await import("@/lib/admin/appointments");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const flat = (call: unknown[]) => text(call).replace(/\s+/g, " ");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const APPT = "9c8b7a65-4d3e-4f21-8a0b-1c2d3e4f5a6b";
const ACTOR = "owner@example.com";
const STARTS = new Date("2026-09-20T17:00:00Z"); // 10:00 AM in Las Vegas

const row = {
  id: APPT, lead_id: JOB, kind: "consultation", starts_at: "2026-09-20T17:00:00Z",
  all_day: false, confirmed_at: null, confirmed_by: null,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("listAppointments", () => {
  it("reads a job's appointments in time order and maps them", async () => {
    sql.mockResolvedValue([row]);
    const [appointment] = await appointments.listAppointments(JOB);
    expect(appointment).toEqual({
      id: APPT, jobId: JOB, kind: "consultation", startsAt: new Date("2026-09-20T17:00:00Z"),
      allDay: false, confirmedAt: null, confirmedBy: null,
    });
    expect(flat(sql.mock.calls[0])).toContain("order by starts_at");
    expect(sql.mock.calls[0]).toContain(JOB);
  });

  it("maps a confirmed row", async () => {
    sql.mockResolvedValue([{ ...row, confirmed_at: "2026-09-18T12:00:00Z", confirmed_by: ACTOR }]);
    const [appointment] = await appointments.listAppointments(JOB);
    expect(appointment.confirmedAt).toEqual(new Date("2026-09-18T12:00:00Z"));
    expect(appointment.confirmedBy).toBe(ACTOR);
  });

  it("returns nothing for a non-uuid job id, without querying", async () => {
    expect(await appointments.listAppointments("../etc")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("saveAppointment", () => {
  // Which body is logged is decided by a SQL CASE, so this checks that both are passed for it to choose.
  it("upserts on (lead_id, kind) and passes both pending bodies in one statement", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    expect(await appointments.saveAppointment(JOB, "consultation", STARTS, false, ACTOR)).toBe("ok");
    expect(sql).toHaveBeenCalledOnce();
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("insert into appointments");
    expect(statement).toContain("on conflict (lead_id, kind) do update set");
    expect(statement).toContain("insert into job_events");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([JOB, "consultation", STARTS, false, ACTOR]));
    const bodies = sql.mock.calls[0].filter((v: unknown) => typeof v === "string" && v.includes("pending confirmation"));
    expect(bodies).toContain("Consultation set for Sun, Sep 20, 10:00 AM — pending confirmation");
    expect(bodies).toContain("Consultation moved to Sun, Sep 20, 10:00 AM — pending confirmation");
  });

  it("always saves as unconfirmed, and replaces rather than inserting a second row for the kind", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "measure", STARTS, false, ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("confirmed_at = null");
    expect(statement).toContain("confirmed_by = null");
    expect(statement).toMatch(/on conflict \(lead_id, kind\) do update set[^;]*confirmed_at = null/);
  });

  it("describes an all-day appointment by its date", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "install", STARTS, true, ACTOR);
    expect(sql.mock.calls[0]).toContain("Install set for Sep 20, 2026 — pending confirmation");
    expect(sql.mock.calls[0]).toContain("Install moved to Sep 20, 2026 — pending confirmation");
    expect(sql.mock.calls[0]).toContain(true);
  });

  it("returns missing when the job is gone", async () => {
    sql.mockResolvedValue([{ job: 0 }]);
    expect(await appointments.saveAppointment(JOB, "service", STARTS, false, ACTOR)).toBe("missing");
  });

  it("returns missing for a non-uuid job id, without touching the database", async () => {
    expect(await appointments.saveAppointment("../etc", "service", STARTS, false, ACTOR)).toBe("missing");
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("confirmAppointment", () => {
  const confirmed = { ...row, confirmed_at: "2026-09-18T12:00:00Z", confirmed_by: ACTOR, found: 1 };

  it("stamps who confirmed it and returns the row", async () => {
    sql.mockResolvedValue([confirmed]);
    const result = await appointments.confirmAppointment(APPT, ACTOR);
    expect(result).toMatchObject({
      id: APPT, jobId: JOB, kind: "consultation", confirmedBy: ACTOR,
      confirmedAt: new Date("2026-09-18T12:00:00Z"),
    });
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("update appointments set confirmed_at = now()");
    expect(statement).toContain("confirmed_by = ?");
    expect(statement).toContain("confirmed_at is null");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([APPT, ACTOR]));
  });

  it("reports a missing appointment and one already confirmed", async () => {
    sql.mockResolvedValue([]);
    expect(await appointments.confirmAppointment(APPT, ACTOR)).toBe("missing");
    sql.mockResolvedValue([{ found: 1, id: null }]);
    expect(await appointments.confirmAppointment(APPT, ACTOR)).toBe("already");
  });

  it("returns missing for a non-uuid id, without touching the database", async () => {
    expect(await appointments.confirmAppointment("../etc", ACTOR)).toBe("missing");
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("cancelAppointment", () => {
  it("deletes the row and logs the cancellation in one statement", async () => {
    sql.mockResolvedValue([row]);
    const result = await appointments.cancelAppointment(APPT, ACTOR);
    expect(result).toMatchObject({ id: APPT, jobId: JOB, kind: "consultation" });
    expect(sql).toHaveBeenCalledOnce();
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("delete from appointments");
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("' cancelled'");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([APPT, ACTOR]));
  });

  it("reports a missing appointment, and refuses a non-uuid id without querying", async () => {
    sql.mockResolvedValue([]);
    expect(await appointments.cancelAppointment(APPT, ACTOR)).toBe("missing");
    sql.mockReset().mockResolvedValue([]);
    expect(await appointments.cancelAppointment("../etc", ACTOR)).toBe("missing");
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("mirrorToJob", () => {
  it("writes both mirrors from the confirmed rows only", async () => {
    await appointments.mirrorToJob(JOB);
    expect(sql).toHaveBeenCalledOnce();
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("update leads set");
    expect(statement).toContain("visit_at = (select a.starts_at from appointments a");
    expect(statement).toContain("install_on = (select (a.starts_at at time zone 'America/Los_Angeles')::date");
    // A kind that is absent or unconfirmed yields no row, so the sub-select writes null.
    expect(statement.match(/confirmed_at is not null/g)).toHaveLength(2);
    expect(statement).toContain("a.kind = 'consultation' and a.confirmed_at is not null");
    expect(statement).toContain("a.kind = 'install' and a.confirmed_at is not null");
    expect(sql.mock.calls[0]).toContain(JOB);
  });

  it("does nothing for a non-uuid job id", async () => {
    await appointments.mirrorToJob("../etc");
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("module boundaries", () => {
  it("never imports the calendar, so lib/calendar can depend on this module", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/admin/appointments.ts", "utf8");
    expect(source).not.toMatch(/from "@?\/?lib\/calendar/);
    expect(source).toContain('import "server-only"');
  });
});
