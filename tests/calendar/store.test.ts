import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const mirrorToJob = vi.fn();
vi.mock("@/lib/admin/appointments", () => ({ mirrorToJob }));
const store = await import("@/lib/calendar/store");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const flat = (call: unknown[]) => text(call).replace(/\s+/g, " ");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
  mirrorToJob.mockReset().mockResolvedValue(undefined);
});

describe("calendar store", () => {
  it("maps a job row for syncing, with the install date as text", async () => {
    sql.mockResolvedValueOnce([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
      treatments: [], status: "quoted", visit_at: "2026-09-20T17:00:00Z", install_on: "2026-10-02" }]);
    const job = await store.getCalendarJob(ID);
    expect(job).toMatchObject({ id: ID, visitAt: new Date("2026-09-20T17:00:00Z"), installOn: "2026-10-02" });
    expect(text(sql.mock.calls[0])).toMatch(/install_on::text/);
  });

  it("returns the job's confirmed appointments, and only those", async () => {
    sql
      .mockResolvedValueOnce([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
        treatments: [], status: "quoted", visit_at: null, install_on: null }])
      .mockResolvedValueOnce([
        { kind: "measure", starts_at: "2026-09-20T17:00:00Z", all_day: false },
        { kind: "install", starts_at: "2026-10-02T15:00:00Z", all_day: true },
      ]);
    const job = await store.getCalendarJob(ID);
    expect(job?.appointments).toEqual([
      { kind: "measure", startsAt: new Date("2026-09-20T17:00:00Z"), allDay: false, designerNotes: null },
      { kind: "install", startsAt: new Date("2026-10-02T15:00:00Z"), allDay: true, designerNotes: null },
    ]);
    const q = flat(sql.mock.calls[1]);
    expect(q).toContain("from appointments");
    expect(q).toContain("confirmed_at is not null");
    expect(sql.mock.calls[1]).toContain(ID);
  });

  it("reads the client's gate code and each confirmed appointment's designer notes for the event body", async () => {
    sql
      .mockResolvedValueOnce([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
        treatments: [], gate_code: "#4321", status: "quoted", visit_at: null, install_on: null }])
      .mockResolvedValueOnce([{ kind: "measure", starts_at: "2026-09-20T17:00:00Z", all_day: false, designer_notes: "Side gate sticks" }]);
    const job = await store.getCalendarJob(ID);
    expect(job?.gateCode).toBe("#4321");
    expect(job?.appointments[0].designerNotes).toBe("Side gate sticks");
    expect(text(sql.mock.calls[0])).toMatch(/treatments, gate_code, status/);
    expect(text(sql.mock.calls[1])).toMatch(/select kind, starts_at, all_day, designer_notes from appointments/);
  });

  it("maps a missing gate code to null", async () => {
    sql.mockResolvedValueOnce([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
      treatments: [], status: "quoted", visit_at: null, install_on: null }]);
    expect((await store.getCalendarJob(ID))?.gateCode).toBeNull();
  });

  it("maps a Date starts_at the driver may hand back instead of a string", async () => {
    sql
      .mockResolvedValueOnce([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
        treatments: [], status: "quoted", visit_at: null, install_on: null }])
      .mockResolvedValueOnce([{ kind: "service", starts_at: new Date("2026-09-20T17:00:00Z"), all_day: false }]);
    const job = await store.getCalendarJob(ID);
    expect(job?.appointments[0].startsAt).toEqual(new Date("2026-09-20T17:00:00Z"));
  });

  it("returns null for a non-uuid without querying", async () => {
    expect(await store.getCalendarJob("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("upserts a link on (lead_id, kind)", async () => {
    await store.saveLink({ leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck" });
    expect(text(sql.mock.calls[0])).toMatch(/on conflict \(lead_id, kind\) do update/);
  });

  it("moves the appointment row, not the mirror column, then mirrors", async () => {
    await store.setJobDate(ID, "measure", new Date("2026-09-20T17:00:00Z"), "Measure moved in Outlook to Sun, Sep 20, 10:00 AM");
    const q = flat(sql.mock.calls[0]);
    expect(q).toContain("update appointments set starts_at");
    expect(q).toContain("insert into job_events");
    // The mirror columns are written only by mirrorToJob, never here.
    expect(q).not.toContain("update leads set visit_at");
    expect(q).not.toContain("install_on =");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "measure", "Outlook", "edit"]));
    expect(mirrorToJob).toHaveBeenCalledWith(ID);
  });

  it("mirrors only after the appointment is written, so the mirror sees the new value", async () => {
    await store.setJobDate(ID, "consultation", new Date("2026-09-20T17:00:00Z"), "Consultation moved in Outlook");
    expect(flat(sql.mock.calls[0])).toContain("update appointments set starts_at");
    expect(sql.mock.invocationCallOrder[0]).toBeLessThan(mirrorToJob.mock.invocationCallOrder[0]);
    expect(mirrorToJob).toHaveBeenCalledWith(ID);
  });

  it("stores an all-day date at Las Vegas midnight", async () => {
    await store.setJobDate(ID, "install", "2026-10-02", "Install moved in Outlook to Fri, Oct 2");
    const q = flat(sql.mock.calls[0]);
    expect(q).toContain("update appointments set starts_at");
    expect(q).toContain("America/Los_Angeles");
    expect(sql.mock.calls[0]).toContain("2026-10-02");
    expect(mirrorToJob).toHaveBeenCalledWith(ID);
  });

  it("deletes the appointment when Outlook removed the event, then mirrors", async () => {
    await store.setJobDate(ID, "install", null, "Install removed in Outlook");
    const q = flat(sql.mock.calls[0]);
    expect(q).toContain("delete from appointments");
    expect(q).toContain("insert into job_events");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "install"]));
    expect(mirrorToJob).toHaveBeenCalledWith(ID);
  });

  it("records and clears the last error", async () => {
    await store.recordError("Graph GET failed (401)");
    expect(text(sql.mock.calls[0])).toMatch(/last_error = /);
    await store.clearError();
    expect(text(sql.mock.calls[1])).toMatch(/last_error = null/);
  });

  it("claims a link with a pending id, returning that id only when the row is new", async () => {
    sql.mockResolvedValueOnce([{ event_id: "pending:abc" }]);
    expect(await store.claimLink(ID, "consultation")).toBe("pending:abc");
    const q = text(sql.mock.calls[0]);
    expect(q).toMatch(/'pending:' \|\| gen_random_uuid\(\)/);
    expect(q).toMatch(/on conflict \(lead_id, kind\) do nothing returning event_id/);
    sql.mockResolvedValueOnce([]);
    expect(await store.claimLink(ID, "consultation")).toBeNull();
  });

  it("deletes a link unconditionally, or only while it still holds a given event id", async () => {
    await store.deleteLink(ID, "consultation");
    expect(text(sql.mock.calls[0])).not.toMatch(/event_id/);
    await store.deleteLink(ID, "consultation", "pending:abc");
    expect(text(sql.mock.calls[1])).toMatch(/where lead_id = \? and kind = \? and event_id = \?/);
    expect(sql.mock.calls[1]).toEqual(expect.arrayContaining([ID, "consultation", "pending:abc"]));
  });

  it("reads each link's synced_at so an abandoned claim can be spotted", async () => {
    sql.mockResolvedValue([{ lead_id: ID, kind: "consultation", event_id: "pending:x", change_key: "", synced_at: "2026-09-14T10:00:00Z" }]);
    expect(await store.getLinks(ID)).toEqual([
      { leadId: ID, kind: "consultation", eventId: "pending:x", changeKey: "", syncedAt: new Date("2026-09-14T10:00:00Z") },
    ]);
    expect(text(sql.mock.calls[0])).toMatch(/synced_at/);
  });

  it("reconciles jobs with a recent appointment as well as linked and recently dated ones", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await store.reconcileTargets()).toEqual([ID]);
    const q = flat(sql.mock.calls[0]);
    expect(q).toMatch(/select a\.lead_id as id from appointments a join leads l on l\.id = a\.lead_id/);
    // Only confirmed appointments on live jobs: an unconfirmed one reaches no calendar, so syncing it is work for nothing.
    expect(q).toMatch(/a\.confirmed_at is not null and l\.status <> 'lost'/);
    expect(q).toMatch(/a\.starts_at >= now\(\) - interval '30 days'/);
    expect(q).toMatch(/join leads l on l\.id = e\.lead_id/);
    expect(q).toMatch(/l\.status = 'lost'/);
  });
});
