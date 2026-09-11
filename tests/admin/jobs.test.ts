import { describe, it, expect, vi, beforeEach } from "vitest";

// Reads use sql.query (the column list is SQL text); writes use the tagged template.
const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const jobs = await import("@/lib/admin/jobs");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

const row = {
  id: ID, created_at: new Date("2026-09-01T00:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: null, city: "Henderson", treatments: ["Shades"],
  window_count: null, heard_via: null, notes: null, source: "contact", status: "quoted",
  stage_changed_at: new Date("2026-09-05T00:00:00Z"), visit_at: null, quote_cents: 450000,
  sold_cents: null, deposit_cents: null, brands: [], ordered_on: null, install_on: null, lost_reason: null,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("reading jobs", () => {
  it("maps database rows to camelCase jobs", async () => {
    sql.query.mockResolvedValue([row]);
    const [job] = await jobs.listJobs({ includeLost: false });
    expect(job).toMatchObject({ id: ID, status: "quoted", quoteCents: 450000, stageChangedAt: row.stage_changed_at });
  });

  it("hides lost jobs unless asked", async () => {
    await jobs.listJobs({ includeLost: false });
    expect(sql.query.mock.calls[0][1]).toEqual([false]);
    await jobs.listJobs({ includeLost: true });
    expect(sql.query.mock.calls[1][1]).toEqual([true]);
  });

  it("returns null for an id that is not a uuid, without querying", async () => {
    expect(await jobs.getJob("../etc")).toBeNull();
    expect(sql.query).not.toHaveBeenCalled();
  });
});

describe("changing jobs", () => {
  it("moves the stage and logs who did it in one statement", async () => {
    await jobs.setStage(ID, "sold", "owner@example.com");
    expect(sql).toHaveBeenCalledOnce();
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("update leads");
    expect(statement).toContain("insert into job_events");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "sold", "owner@example.com"]));
  });

  it("refuses a stage that does not exist", async () => {
    await expect(jobs.setStage(ID, "shipped" as never, "owner@example.com")).rejects.toThrow(/stage/);
    expect(sql).not.toHaveBeenCalled();
  });

  it("records the lost reason with the stage change", async () => {
    await jobs.setStage(ID, "lost", "owner@example.com", "Went with a cheaper quote");
    expect(sql.mock.calls[0]).toContain("Went with a cheaper quote");
  });

  it("logs a note against the job", async () => {
    await jobs.addNote(ID, "Wants the patio in spring", "owner@example.com");
    expect(text(sql.mock.calls[0])).toContain("insert into job_events");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "owner@example.com", "Wants the patio in spring"]));
  });

  it("creates a hand-entered job and returns its id", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    const id = await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone" },
      "owner@example.com",
    );
    expect(id).toBe(ID);
    expect(text(sql.mock.calls[0])).toContain("insert into leads");
  });
});
