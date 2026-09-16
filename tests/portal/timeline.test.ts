import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const { stageDates, lastMeasuredAt, installAppointmentAt } = await import("@/lib/portal/timeline");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  sql.mockReset().mockResolvedValue([]);
});

describe("stageDates", () => {
  it("selects only the status and the time — never an event body", async () => {
    await stageDates(JOB);

    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("to_status");
    expect(statement).toContain("created_at");
    expect(statement).toContain("kind = 'stage'");
    // The events table holds internal notes. No body column may appear in this query, in any form.
    expect(statement).not.toMatch(/body/i);
  });

  it("keeps the first time each status was reached", async () => {
    sql.mockResolvedValue([
      { to_status: "quoted", created_at: "2026-09-10T18:00:00Z" },
      { to_status: "sold", created_at: "2026-09-12T18:00:00Z" },
      { to_status: "quoted", created_at: "2026-09-14T18:00:00Z" },
    ]);

    const dates = await stageDates(JOB);
    expect(dates.quoted).toEqual(new Date("2026-09-10T18:00:00Z"));
    expect(dates.sold).toEqual(new Date("2026-09-12T18:00:00Z"));
  });

  it("ignores rows with no status and statuses that are not stages", async () => {
    sql.mockResolvedValue([
      { to_status: null, created_at: "2026-09-10T18:00:00Z" },
      { to_status: "contacted", created_at: "2026-09-11T18:00:00Z" },
    ]);

    expect(await stageDates(JOB)).toEqual({});
  });

  it("returns nothing for a non-uuid without querying", async () => {
    expect(await stageDates("not-a-uuid")).toEqual({});
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("lastMeasuredAt", () => {
  it("takes the most recently saved measurement, and selects no free text", async () => {
    sql.mockResolvedValue([{ at: "2026-09-08T18:00:00Z" }]);
    expect(await lastMeasuredAt(JOB)).toEqual(new Date("2026-09-08T18:00:00Z"));

    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("window_measurements");
    // Measurements carry the owners' own notes. Only the time may be selected.
    expect(statement).not.toMatch(/notes|room|label/i);
  });

  it("is null when the job has no measurements", async () => {
    sql.mockResolvedValue([{ at: null }]);
    expect(await lastMeasuredAt(JOB)).toBeNull();
  });

  it("returns null for a non-uuid without querying", async () => {
    expect(await lastMeasuredAt("not-a-uuid")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("installAppointmentAt", () => {
  it("takes the confirmed install appointment only", async () => {
    sql.mockResolvedValue([{ starts_at: "2026-10-13T17:00:00Z" }]);
    expect(await installAppointmentAt(JOB)).toEqual(new Date("2026-10-13T17:00:00Z"));

    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("kind = 'install'");
    expect(statement).toContain("confirmed_at is not null");
  });

  it("is null when no install appointment is confirmed", async () => {
    sql.mockResolvedValue([]);
    expect(await installAppointmentAt(JOB)).toBeNull();
  });

  it("returns null for a non-uuid without querying", async () => {
    expect(await installAppointmentAt("not-a-uuid")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});
