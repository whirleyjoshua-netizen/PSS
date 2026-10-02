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

const NO_TIMING = { windowStart: null, windowEnd: null, durationMinutes: null };

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
      allDay: false, confirmedAt: null, confirmedBy: null, designerNotes: null,
      windowStart: null, windowEnd: null, durationMinutes: null,
    });
    expect(flat(sql.mock.calls[0])).toContain("order by starts_at");
    expect(flat(sql.mock.calls[0])).toContain("confirmed_by, designer_notes,");
    expect(flat(sql.mock.calls[0])).toContain("window_start::text as window_start, window_end::text as window_end, duration_minutes");
    expect(sql.mock.calls[0]).toContain(JOB);
  });

  it("maps a confirmed row", async () => {
    sql.mockResolvedValue([{ ...row, confirmed_at: "2026-09-18T12:00:00Z", confirmed_by: ACTOR }]);
    const [appointment] = await appointments.listAppointments(JOB);
    expect(appointment.confirmedAt).toEqual(new Date("2026-09-18T12:00:00Z"));
    expect(appointment.confirmedBy).toBe(ACTOR);
  });

  it("maps the designer notes", async () => {
    sql.mockResolvedValue([{ ...row, designer_notes: "Bring the motorized samples.\nDog in the yard." }]);
    const [appointment] = await appointments.listAppointments(JOB);
    expect(appointment.designerNotes).toBe("Bring the motorized samples.\nDog in the yard.");
  });

  it("maps the arrival window as clock times and the length in minutes", async () => {
    sql.mockResolvedValue([{ ...row, window_start: "08:00:00", window_end: "10:00:00", duration_minutes: 240 }]);
    const [appointment] = await appointments.listAppointments(JOB);
    expect(appointment).toMatchObject({ windowStart: "08:00", windowEnd: "10:00", durationMinutes: 240 });
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
    expect(await appointments.saveAppointment(JOB, "consultation", STARTS, false, NO_TIMING, ACTOR)).toBe("ok");
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
    await appointments.saveAppointment(JOB, "measure", STARTS, false, NO_TIMING, ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("confirmed_at = null");
    expect(statement).toContain("confirmed_by = null");
    expect(statement).toMatch(/on conflict \(lead_id, kind\) do update set[^;]*confirmed_at = null/);
  });

  it("saves the arrival window and length, and a timing change resets confirmation", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "install", STARTS, false, { windowStart: "08:00", windowEnd: "10:00", durationMinutes: 240 }, ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("window_start, window_end, duration_minutes");
    expect(statement).toContain("?::time, ?::time, ?::integer");
    expect(statement).toMatch(
      /on conflict \(lead_id, kind\) do update set[^;]*window_start = excluded.window_start, window_end = excluded.window_end, duration_minutes = excluded.duration_minutes, confirmed_at = null/,
    );
    const params = sql.mock.calls[0].slice(1);
    const at = params.indexOf("08:00");
    expect(params.slice(at, at + 3)).toEqual(["08:00", "10:00", 240]);
  });

  it("describes an all-day appointment by its date", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "install", STARTS, true, NO_TIMING, ACTOR);
    expect(sql.mock.calls[0]).toContain("Install set for Sep 20, 2026 — pending confirmation");
    expect(sql.mock.calls[0]).toContain("Install moved to Sep 20, 2026 — pending confirmation");
    expect(sql.mock.calls[0]).toContain(true);
  });

  it("returns missing when the job is gone", async () => {
    sql.mockResolvedValue([{ job: 0 }]);
    expect(await appointments.saveAppointment(JOB, "service", STARTS, false, NO_TIMING, ACTOR)).toBe("missing");
  });

  it("returns missing for a non-uuid job id, without touching the database", async () => {
    expect(await appointments.saveAppointment("../etc", "service", STARTS, false, NO_TIMING, ACTOR)).toBe("missing");
    expect(sql).not.toHaveBeenCalled();
  });
  it("saves the designer notes, and a reschedule replaces them with what the dialog sent", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "measure", STARTS, false, NO_TIMING, ACTOR, { designerNotes: "Bring samples" });
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("duration_minutes, designer_notes, confirmed_at, confirmed_by)");
    expect(statement).toMatch(/on conflict \(lead_id, kind\) do update set[^;]*designer_notes = excluded\.designer_notes/);
    expect(sql.mock.calls[0]).toContain("Bring samples");
  });

  it("saves a changed gate code to the client in the same statement, and keeps it out of the log line", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "consultation", STARTS, false, NO_TIMING, ACTOR, { designerNotes: null, gateCode: "#4321" });
    expect(sql).toHaveBeenCalledOnce();
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("update leads set gate_code = ?::text, updated_at = now() where id = ? and ?::boolean and gate_code is distinct from ?::text");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["#4321", true]));
    // Only the job_events insert, never the gate code, reaches the activity log.
    const log = statement.slice(statement.indexOf("insert into job_events"));
    expect(log).not.toMatch(/gate/);
    const bodies = sql.mock.calls[0].filter((v: unknown) => typeof v === "string" && v.includes("pending confirmation"));
    for (const body of bodies) expect(body).not.toContain("#4321");
  });

  it("leaves the gate code alone when none was sent", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "consultation", STARTS, false, NO_TIMING, ACTOR, { designerNotes: null });
    // The value bound just before "::boolean and gate_code" is the flag: false, so the leads update matches no row.
    const at = text(sql.mock.calls[0]).split("?").findIndex((part) => part.startsWith("::boolean and gate_code"));
    expect(at).toBeGreaterThan(0);
    expect(sql.mock.calls[0][at]).toBe(false);
  });
});

describe("setAppointmentNotes", () => {
  it("writes the notes on this job's appointment without un-confirming it, in one statement", async () => {
    sql.mockResolvedValue([{ found: 1 }]);
    expect(await appointments.setAppointmentNotes(JOB, APPT, { designerNotes: "Side gate sticks" }, ACTOR)).toBe("ok");
    expect(sql).toHaveBeenCalledOnce();
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("update appointments set designer_notes = ?::text where id = ? and lead_id = ?");
    expect(statement).not.toContain("confirmed_at");
    expect(statement).not.toContain("confirmed_by");
    // A newer updated_at tells the route planner the day changed; notes do not change a route.
    const update = statement.slice(statement.indexOf("update appointments"), statement.indexOf("returning lead_id, kind"));
    expect(update).not.toContain("updated_at");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Side gate sticks", APPT, JOB, ACTOR]));
  });

  it("logs that the notes changed, naming the kind but never the notes or the gate code", async () => {
    sql.mockResolvedValue([{ found: 1 }]);
    await appointments.setAppointmentNotes(JOB, APPT, { designerNotes: "Side gate sticks", gateCode: "#4321" }, ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("initcap(kind) || ' notes updated' from noted");
    const log = statement.slice(statement.indexOf("insert into job_events"));
    expect(log).not.toMatch(/gate|designer_notes/);
  });

  it("saves a changed gate code to the appointment's client in the same statement", async () => {
    sql.mockResolvedValue([{ found: 1 }]);
    await appointments.setAppointmentNotes(JOB, APPT, { designerNotes: null, gateCode: "#4321" }, ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("update leads set gate_code = ?::text, updated_at = now() where id = (select lead_id from noted) and ?::boolean and gate_code is distinct from ?::text");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["#4321", true]));
  });

  it("reports an appointment that is gone or belongs to another job", async () => {
    sql.mockResolvedValue([{ found: 0 }]);
    expect(await appointments.setAppointmentNotes(JOB, APPT, { designerNotes: "x" }, ACTOR)).toBe("missing");
  });

  it("refuses a non-uuid id without touching the database", async () => {
    expect(await appointments.setAppointmentNotes("../etc", APPT, { designerNotes: "x" }, ACTOR)).toBe("missing");
    expect(await appointments.setAppointmentNotes(JOB, "../etc", { designerNotes: "x" }, ACTOR)).toBe("missing");
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
    expect(statement).toContain("returning id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by, window_start::text as window_start, window_end::text as window_end, duration_minutes");
    expect(statement).toContain("c.window_start, c.window_end, c.duration_minutes");
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
    expect(statement.match(/window_start::text as window_start, window_end::text as window_end, duration_minutes/g)).toHaveLength(1);
    expect(statement).toContain("select id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by, window_start, window_end, duration_minutes from gone");
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

describe("logConfirmation", () => {
  it("logs the kind and when it is booked for, as the signed-in owner", async () => {
    await appointments.logConfirmation(
      { id: APPT, jobId: JOB, kind: "consultation", startsAt: STARTS, allDay: false, confirmedAt: new Date(), confirmedBy: ACTOR, designerNotes: null, ...NO_TIMING },
      ACTOR,
    );
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("insert into job_events");
    expect(sql.mock.calls[0]).toEqual(
      expect.arrayContaining([JOB, ACTOR, "Consultation confirmed for Sun, Sep 20, 10:00 AM"]),
    );
  });

  it("describes an all-day appointment by its date alone", async () => {
    await appointments.logConfirmation(
      { id: APPT, jobId: JOB, kind: "install", startsAt: STARTS, allDay: true, confirmedAt: new Date(), confirmedBy: ACTOR, designerNotes: null, ...NO_TIMING },
      ACTOR,
    );
    expect(sql.mock.calls[0]).toContain("Install confirmed for Sep 20, 2026");
  });

  it("does nothing for a non-uuid job id", async () => {
    await appointments.logConfirmation(
      { id: APPT, jobId: "../etc", kind: "install", startsAt: STARTS, allDay: true, confirmedAt: new Date(), confirmedBy: ACTOR, designerNotes: null, ...NO_TIMING },
      ACTOR,
    );
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("logAppointmentEmail", () => {
  it("records the address the confirmation went to", async () => {
    await appointments.logAppointmentEmail(JOB, "dana@example.com", ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("'email'");
    expect(sql.mock.calls[0]).toEqual(
      expect.arrayContaining([JOB, ACTOR, "Appointment email sent to dana@example.com"]),
    );
  });

  it("does nothing for a non-uuid job id", async () => {
    await appointments.logAppointmentEmail("../etc", "dana@example.com", ACTOR);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("logAppointmentProblem", () => {
  it("records why the customer was not told, against the job", async () => {
    await appointments.logAppointmentProblem(JOB, "Appointment confirmed but no email address on file", ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("'email'");
    expect(sql.mock.calls[0]).toEqual(
      expect.arrayContaining([JOB, ACTOR, "Appointment confirmed but no email address on file"]),
    );
  });

  it("does nothing for a non-uuid job id", async () => {
    await appointments.logAppointmentProblem("../etc", "anything", ACTOR);
    expect(sql).not.toHaveBeenCalled();
  });
});
