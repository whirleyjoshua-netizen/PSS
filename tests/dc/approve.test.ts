import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { approveDcQuote, offeredVersion } = await import("@/lib/dc/approve");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const V = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

beforeEach(() => { sql.mockReset().mockResolvedValue([]); });

describe("offeredVersion", () => {
  it("reads the job's one offered version", async () => {
    sql.mockResolvedValueOnce([{ id: V, version: 2, quote_file_id: "f1", approved_at: "2026-09-29T17:00:00Z" }]);
    expect(await offeredVersion(JOB)).toEqual({ id: V, version: 2, quoteFileId: "f1", approvedAt: new Date("2026-09-29T17:00:00Z") });
    expect(text(sql.mock.calls[0])).toContain("where lead_id = ? and status = 'offered'");
  });
  it("is null when none is offered, and never queries a malformed id", async () => {
    expect(await offeredVersion(JOB)).toBeNull();
    sql.mockClear();
    expect(await offeredVersion("x")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("approveDcQuote", () => {
  it("in ONE statement stamps the approval once, only on a shared offered quote of a job that is not Lost, and moves Quoted to Approved", async () => {
    sql.mockResolvedValueOnce([{ version: 2, moved: true }]);
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toEqual({ version: 2, moved: true });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update dc_quote_versions set approved_at = now(), approved_by = ?",
      "where id = ? and lead_id = ? and status = 'offered' and approved_at is null",
      "exists (select 1 from leads where id = ? and status <> 'lost')",
      "exists (select 1 from job_files f where f.id = dc_quote_versions.quote_file_id and f.shared_at is not null)",
      "update leads set status = 'approved'", "where id = ? and status = 'quoted' and exists (select 1 from approved)",
      "'stage', prev.status, 'approved', 'Approved quote version ' || approved.version",
      "'quote', 'Approved quote version ' || version || ' from their project page' from approved where not exists (select 1 from moved)",
    ]) expect(s).toContain(part);
  });
  it("says whether the job's stage moved, from the same statement: a change order past Quoted does not", async () => {
    sql.mockResolvedValueOnce([{ version: 3, moved: false }]);
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toEqual({ version: 3, moved: false });
    expect(text(sql.mock.calls[0])).toContain("select version, exists (select 1 from moved) as moved from approved");
  });
  it("answers null for a second approval, which changes nothing", async () => {
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toBeNull();
  });
});
