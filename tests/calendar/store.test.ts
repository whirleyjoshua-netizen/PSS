import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/calendar/store");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => { sql.mockReset().mockResolvedValue([]); sql.query.mockReset().mockResolvedValue([]); });

describe("calendar store", () => {
  it("maps a job row for syncing, with the install date as text", async () => {
    sql.mockResolvedValue([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
      treatments: [], status: "quoted", visit_at: "2026-09-20T17:00:00Z", install_on: "2026-10-02" }]);
    const job = await store.getCalendarJob(ID);
    expect(job).toMatchObject({ id: ID, visitAt: new Date("2026-09-20T17:00:00Z"), installOn: "2026-10-02" });
    expect(text(sql.mock.calls[0])).toMatch(/install_on::text/);
  });

  it("returns null for a non-uuid without querying", async () => {
    expect(await store.getCalendarJob("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("upserts a link on (lead_id, kind)", async () => {
    await store.saveLink({ leadId: ID, kind: "visit", eventId: "e1", changeKey: "ck" });
    expect(text(sql.mock.calls[0])).toMatch(/on conflict \(lead_id, kind\) do update/);
  });

  it("sets a visit date and logs it as an Outlook edit in one statement", async () => {
    await store.setJobDate(ID, "visit", new Date("2026-09-20T17:00:00Z"), "Visit moved in Outlook to Sun, Sep 20, 10:00 AM");
    const q = text(sql.mock.calls[0]);
    expect(q).toMatch(/update leads set visit_at/);
    expect(q).toMatch(/insert into job_events/);
    expect(sql.mock.calls[0]).toContain("Outlook");
    expect(sql.mock.calls[0]).toContain("edit");
  });

  it("sets an install date through the install column", async () => {
    await store.setJobDate(ID, "install", null, "Install removed in Outlook");
    expect(text(sql.mock.calls[0])).toMatch(/update leads set install_on/);
  });

  it("records and clears the last error", async () => {
    await store.recordError("Graph GET failed (401)");
    expect(text(sql.mock.calls[0])).toMatch(/last_error = /);
    await store.clearError();
    expect(text(sql.mock.calls[1])).toMatch(/last_error = null/);
  });

  it("claims a link with a pending id, returning that id only when the row is new", async () => {
    sql.mockResolvedValueOnce([{ event_id: "pending:abc" }]);
    expect(await store.claimLink(ID, "visit")).toBe("pending:abc");
    const q = text(sql.mock.calls[0]);
    expect(q).toMatch(/'pending:' \|\| gen_random_uuid\(\)/);
    expect(q).toMatch(/on conflict \(lead_id, kind\) do nothing returning event_id/);
    sql.mockResolvedValueOnce([]);
    expect(await store.claimLink(ID, "visit")).toBeNull();
  });

  it("deletes a link unconditionally, or only while it still holds a given event id", async () => {
    await store.deleteLink(ID, "visit");
    expect(text(sql.mock.calls[0])).not.toMatch(/event_id/);
    await store.deleteLink(ID, "visit", "pending:abc");
    expect(text(sql.mock.calls[1])).toMatch(/where lead_id = \? and kind = \? and event_id = \?/);
    expect(sql.mock.calls[1]).toEqual(expect.arrayContaining([ID, "visit", "pending:abc"]));
  });

  it("reads each link's synced_at so an abandoned claim can be spotted", async () => {
    sql.mockResolvedValue([{ lead_id: ID, kind: "visit", event_id: "pending:x", change_key: "", synced_at: "2026-09-14T10:00:00Z" }]);
    expect(await store.getLinks(ID)).toEqual([
      { leadId: ID, kind: "visit", eventId: "pending:x", changeKey: "", syncedAt: new Date("2026-09-14T10:00:00Z") },
    ]);
    expect(text(sql.mock.calls[0])).toMatch(/synced_at/);
  });

  it("reconciles linked jobs only when lost, undated, or within the same 30-day window", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await store.reconcileTargets()).toEqual([ID]);
    const q = text(sql.mock.calls[0]).replace(/\s+/g, " ");
    expect(q).toMatch(/join leads l on l\.id = e\.lead_id/);
    expect(q).toMatch(/l\.status = 'lost'/);
    expect(q).toMatch(/e\.kind = 'visit' and \(l\.visit_at is null or l\.visit_at >= now\(\) - interval '30 days'\)/);
    expect(q).toMatch(/e\.kind = 'install' and \(l\.install_on is null or l\.install_on >= current_date - 30\)/);
  });
});
