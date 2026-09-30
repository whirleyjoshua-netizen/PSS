import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const del = vi.fn().mockResolvedValue(undefined);
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del, get: vi.fn() }));
const files = await import("@/lib/admin/files");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
/** The quote PDF of a version the client is approving, or whose contract grew from it. */
const LIVE_QUOTE = "not exists ( select 1 from dc_quote_versions q where q.quote_file_id = job_files.id and q.status in ('offered','sent','signed') )";
/** The quote PDF of a version Send quote replaced, or a cancelled one. */
const RETIRED_QUOTE = "not exists ( select 1 from dc_quote_versions q where q.quote_file_id = job_files.id and q.status in ('superseded','cancelled') )";

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  del.mockClear();
});

describe("a quote PDF Send quote shared (ruling P17)", () => {
  it("listFiles flags it in the same statement, and toFile leaves the flag undefined when not computed", async () => {
    sql.mockResolvedValueOnce([
      { id: FILE, lead_id: JOB, created_at: new Date().toISOString(), size_bytes: 1, quote_file: true },
      { id: "other", lead_id: JOB, created_at: new Date().toISOString(), size_bytes: 1, quote_file: false },
    ]);
    const [quote, other] = await files.listFiles(JOB);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(text(sql.mock.calls[0])).toContain("exists ( select 1 from dc_quote_versions q where q.quote_file_id = job_files.id ) as quote_file");
    expect(quote.quoteFile).toBe(true);
    expect(other.quoteFile).toBe(false);
    expect(files.toFile({ id: FILE, size_bytes: 1 }).quoteFile).toBeUndefined();
  });

  it("deleteFile refuses a live quote in its one statement, keeping the older guards, and leaves the bytes", async () => {
    expect(await files.deleteFile(FILE, "o")).toBe(false);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain(`and ${LIVE_QUOTE}`);
    expect(s).toContain("where v.source_file_id = job_files.id or v.contract_file_id = job_files.id");
    expect(del).not.toHaveBeenCalled();
  });

  it("setDocType refuses to relabel a live quote, in its one statement", async () => {
    expect(await files.setDocType(JOB, FILE, "other", "o")).toBe(false);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(text(sql.mock.calls[0])).toContain(`and ${LIVE_QUOTE}`);
  });

  it("setShared never unshares a live quote, and never re-shares a superseded or cancelled one", async () => {
    for (const shared of [true, false]) {
      sql.mockClear();
      expect(await files.setShared(JOB, FILE, shared, "o")).toBe(false);
      expect(sql).toHaveBeenCalledTimes(1);
      const call = sql.mock.calls[0];
      const s = text(call);
      expect(s).toContain(`and (? or ${LIVE_QUOTE})`);
      expect(s).toContain(`and (not ? or ${RETIRED_QUOTE})`);
      // The placeholders before each clause are `shared` itself: the unshare guard is skipped when sharing, and vice versa.
      const strings = call[0] as TemplateStringsArray;
      const valueBefore = (fragment: string) => call[strings.findIndex((part) => part.replace(/\s+/g, " ").startsWith(fragment))];
      expect(valueBefore(` or ${LIVE_QUOTE}`)).toBe(shared);
      expect(valueBefore(` or ${RETIRED_QUOTE}`)).toBe(shared);
    }
  });

  it("leaves an ordinary file alone: every quote guard names the file by quote_file_id, so each change goes through", async () => {
    sql.mockResolvedValue([{ lead_id: JOB, blob_pathname: "jobs/x/plain.pdf" }]);
    expect(await files.setShared(JOB, FILE, true, "o")).toBe(true);
    expect(await files.setShared(JOB, FILE, false, "o")).toBe(true);
    expect(await files.setDocType(JOB, FILE, "other", "o")).toBe(true);
    expect(await files.deleteFile(FILE, "o")).toBe(true);
    expect(del).toHaveBeenCalledWith("jobs/x/plain.pdf");
    for (const call of sql.mock.calls) {
      const s = text(call);
      // No unconditional refusal: each dc_quote_versions q clause is tied to this file's id.
      for (const clause of s.match(/dc_quote_versions q where [^)]*/g) ?? []) expect(clause).toContain("q.quote_file_id = job_files.id");
    }
  });
});
