import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { approveDcQuote, offeredVersion, offeredVersions } = await import("@/lib/dc/approve");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const V = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

beforeEach(() => { sql.mockReset().mockResolvedValue([]); });

describe("offeredVersion", () => {
  it("reads the job's one offered version", async () => {
    sql.mockResolvedValueOnce([{ id: V, version: 2, option: "A", quote_file_id: "f1", approved_at: "2026-09-29T17:00:00Z", client_total_cents: 184834 }]);
    expect(await offeredVersion(JOB)).toEqual({ id: V, version: 2, option: "A", quoteFileId: "f1", approvedAt: new Date("2026-09-29T17:00:00Z"), clientTotalCents: 184834 });
    expect(text(sql.mock.calls[0])).toContain("where lead_id = ? and status = 'offered'");
  });
  it("is null when none is offered, and never queries a malformed id", async () => {
    expect(await offeredVersion(JOB)).toBeNull();
    sql.mockClear();
    expect(await offeredVersion("x")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("offeredVersions", () => {
  it("reads every offered version of the job, one per option, A first", async () => {
    const VB = "8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
    sql.mockResolvedValueOnce([
      { id: V, version: 2, option: "A", quote_file_id: "fa", approved_at: null, client_total_cents: 184834 },
      { id: VB, version: 1, option: "B", quote_file_id: "fb", approved_at: "2026-09-29T17:00:00Z", client_total_cents: null },
    ]);
    expect(await offeredVersions(JOB)).toEqual([
      { id: V, version: 2, option: "A", quoteFileId: "fa", approvedAt: null, clientTotalCents: 184834 },
      { id: VB, version: 1, option: "B", quoteFileId: "fb", approvedAt: new Date("2026-09-29T17:00:00Z"), clientTotalCents: null },
    ]);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("select id, version, option, quote_file_id, approved_at, client_total_cents from dc_quote_versions");
    expect(s).toContain("where lead_id = ? and status = 'offered' order by option, version desc");
  });
  it("is empty for a malformed id, without a query", async () => {
    expect(await offeredVersions("x")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("approveDcQuote", () => {
  it("in ONE statement stamps the approval once, only on a shared offered quote of a job that is not Lost", async () => {
    sql.mockResolvedValueOnce([{ version: 2, option: "A", moved: true }]);
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toEqual({ version: 2, option: "A", moved: true });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update dc_quote_versions set approved_at = now(), approved_by = ?",
      "where id = ? and lead_id = ? and status = 'offered' and approved_at is null",
      "exists (select 1 from leads where id = ? and status <> 'lost')",
      "exists (select 1 from job_files f where f.id = dc_quote_versions.quote_file_id and f.shared_at is not null)",
      "returning id, version, option, po_reference, client_total_cents",
      "select version, option, exists (select 1 from moved) as moved from approved",
    ]) expect(s).toContain(part);
  });

  it("closes every other option's draft or offered version in the same statement, and unshares their quotes unless signed", async () => {
    await approveDcQuote(JOB, V, "maria@example.com");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("closed as ( update dc_quote_versions set status = 'superseded' where lead_id = ? and status in ('draft','offered') and option <> (select option from approved) returning quote_file_id )");
    expect(s).toContain("unshared as ( update job_files set shared_at = null where lead_id = ? and id in (select quote_file_id from closed) and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id) returning id )");
  });

  it("records the approved total as quote_cents and moves Quoted to Approved in the ONE update of the job", async () => {
    await approveDcQuote(JOB, V, "maria@example.com");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("updated as ( update leads set quote_cents = (select client_total_cents from approved), status = case when status = 'quoted' then 'approved' else status end, stage_changed_at = case when status = 'quoted' then now() else stage_changed_at end, updated_at = now() where id = ? and exists (select 1 from approved) returning id )");
    expect(s).toContain("moved as (select 1 from prev, updated where prev.status = 'quoted')");
    expect(s.match(/update leads/g)).toHaveLength(1);
  });

  it("names the option in the events: option A as before, another option by its number", async () => {
    await approveDcQuote(JOB, V, "maria@example.com");
    const s = text(sql.mock.calls[0]);
    const label = "case when approved.option = 'A' then 'Approved quote version ' || approved.version else 'Approved ' || approved.po_reference || ' version ' || approved.version end";
    expect(s).toContain(`select ?, ?, 'stage', prev.status, 'approved', ${label} from prev, moved, approved`);
    expect(s).toContain(`select ?, ?, 'quote', ${label} || ' from their project page' from approved where not exists (select 1 from moved)`);
  });

  it("answers null for a second approval, which changes nothing", async () => {
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toBeNull();
  });
});
