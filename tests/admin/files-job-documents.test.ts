import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn().mockResolvedValue(undefined), get: vi.fn() }));
const files = await import("@/lib/admin/files");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const NAMED_BY_DOCUMENT = "not exists ( select 1 from job_documents d where d.file_id = job_files.id )";
const ACKNOWLEDGED = "not exists ( select 1 from document_acknowledgements a where a.file_id = job_files.id )";

beforeEach(() => sql.mockReset().mockResolvedValue([]));

describe("files a job document names", () => {
  it("listFiles marks them, and toFile leaves the flag undefined when not computed", async () => {
    sql.mockResolvedValueOnce([{ id: FILE, lead_id: JOB, created_at: new Date().toISOString(), size_bytes: 1, job_document: true }]);
    const [file] = await files.listFiles(JOB);
    expect(file.jobDocument).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("exists ( select 1 from job_documents d where d.file_id = job_files.id ) as job_document");
    expect(files.toFile({ id: FILE, size_bytes: 1 }).jobDocument).toBeUndefined();
  });
  it("deleteFile refuses them and acknowledged files, keeping the older guards", async () => {
    expect(await files.deleteFile(FILE, "o")).toBe(false);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain(NAMED_BY_DOCUMENT);
    expect(s).toContain(ACKNOWLEDGED);
    expect(s).toContain("select 1 from contract_signatures s");
    expect(s).toContain("select 1 from dc_quote_versions v");
  });
  it("setDocType refuses them and acknowledged files", async () => {
    await files.setDocType(JOB, FILE, "other", "o");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain(`and ${NAMED_BY_DOCUMENT}`);
    expect(s).toContain(`and ${ACKNOWLEDGED}`);
  });
  it("setShared refuses them in both directions, and never unshares an acknowledged file", async () => {
    for (const shared of [true, false]) {
      sql.mockClear();
      await files.setShared(JOB, FILE, shared, "o");
      const s = text(sql.mock.calls[0]);
      expect(s).toContain(`and ${NAMED_BY_DOCUMENT}`);
      expect(s).toContain(`and (? or ${ACKNOWLEDGED})`);
    }
  });
});
