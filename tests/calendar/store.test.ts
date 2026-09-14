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
});
