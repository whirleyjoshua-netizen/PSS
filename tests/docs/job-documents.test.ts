import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKER_SOURCE } from "@/lib/docs/fields";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/docs/job-documents");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const TEMPLATE = "44444444-4444-4444-8444-444444444444";

beforeEach(() => sql.mockReset());

describe("reading", () => {
  it("maps a row, newest first, for one job", async () => {
    sql.mockResolvedValueOnce([{ id: DOC, lead_id: JOB, template_id: null, title: "SA", kind: "service_agreement", response: "sign",
      body: "b", status: "sent", file_id: FILE, sent_at: "2026-09-28T18:00:00Z", sent_by: "o", completed_at: null, voided_at: null,
      created_by: "o", created_at: "2026-09-28T17:00:00Z", updated_at: "2026-09-28T18:00:00Z" }]);
    const [doc] = await store.listJobDocuments(JOB);
    expect(text(sql.mock.calls[0])).toContain("where lead_id = ? order by created_at desc");
    expect(doc).toMatchObject({ id: DOC, leadId: JOB, templateId: null, status: "sent", fileId: FILE, sentAt: new Date("2026-09-28T18:00:00Z"), completedAt: null });
  });
  it("reads one document only within its job", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.getJobDocument(JOB, DOC)).toBeNull();
    expect(text(sql.mock.calls[0])).toContain("where id = ? and lead_id = ?");
    expect(await store.getJobDocument(JOB, "nope")).toBeNull();
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe("insertDraft", () => {
  it("inserts the draft and its event in ONE statement, only for a job that exists", async () => {
    sql.mockResolvedValueOnce([{ id: "new" }]);
    const id = await store.insertDraft({ leadId: JOB, templateId: TEMPLATE, title: "SA — PSS-1048", kind: "service_agreement",
      response: "acknowledge", body: "Hi", actor: "o@x.com" });
    expect(id).toBe("new");
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of ["insert into job_documents", "from leads where id = ?", "'draft'", "insert into job_events", "'document'", "'Drafted \"' || title || '\"'"]) {
      expect(s).toContain(part);
    }
  });
  it("never queries for a malformed template id", async () => {
    expect(await store.insertDraft({ leadId: JOB, templateId: "nope", title: "t", kind: "other", response: "view", body: "b", actor: "o" })).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
  it("writes nothing for a template id that does not exist, and allows no template at all", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.insertDraft({ leadId: JOB, templateId: TEMPLATE, title: "t", kind: "other", response: "view", body: "b", actor: "o" })).toBeNull();
    expect(text(sql.mock.calls[0])).toContain("and (?::uuid is null or exists (select 1 from document_templates where id = ?::uuid))");
    expect(sql.mock.calls[0].filter((bind) => bind === TEMPLATE)).toHaveLength(3);
  });
  it("answers null when the job does not exist", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.insertDraft({ leadId: JOB, templateId: null, title: "t", kind: "other", response: "view", body: "b", actor: "o" })).toBeNull();
  });
});

describe("line endings", () => {
  // A server action posts FormData as multipart, which turns every LF into CRLF. The store keeps LF,
  // so what the editor holds (LF) equals what is saved, and a save doesn't leave the draft "dirty".
  it("insertDraft and updateDraft store a CRLF or CR body as LF", async () => {
    sql.mockResolvedValueOnce([{ id: "new" }]).mockResolvedValueOnce([{ id: DOC }]);
    await store.insertDraft({ leadId: JOB, templateId: null, title: "t", kind: "other", response: "view", body: "a\r\nb\rc\n", actor: "o" });
    await store.updateDraft({ leadId: JOB, documentId: DOC, title: "T", body: "a\r\n\r\nb" });
    expect(sql.mock.calls[0]).toContain("a\nb\nc\n");
    expect(sql.mock.calls[0].some((bind) => typeof bind === "string" && bind.includes("\r"))).toBe(false);
    expect(sql.mock.calls[1].slice(1)).toEqual(["T", "a\n\nb", DOC, JOB]);
  });
});

describe("drafts only", () => {
  it("updateDraft touches a draft of this job and nothing else", async () => {
    sql.mockResolvedValueOnce([{ id: DOC }]).mockResolvedValueOnce([]);
    expect(await store.updateDraft({ leadId: JOB, documentId: DOC, title: "T", body: "B" })).toBe(true);
    expect(await store.updateDraft({ leadId: JOB, documentId: DOC, title: "T", body: "B" })).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("where id = ? and lead_id = ? and status = 'draft'");
  });
  it("discardDraft deletes a draft and logs it in one statement", async () => {
    sql.mockResolvedValueOnce([{ lead_id: JOB }]);
    expect(await store.discardDraft(JOB, DOC, "o")).toBe(true);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("delete from job_documents where id = ? and lead_id = ? and status = 'draft'");
    expect(s).toContain("'Discarded draft \"' || title || '\"'");
  });
});

describe("markSent", () => {
  const input = { leadId: JOB, documentId: DOC, fileId: FILE, title: "SA", body: "Final text", actor: "o@x.com" };
  it("sends, links, shares and logs in ONE statement", async () => {
    sql.mockResolvedValueOnce([{ lead_id: JOB }]);
    expect(await store.markSent(input)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "set status = case when response = 'view' then 'completed' else 'sent' end",
      "completed_at = case when response = 'view' then now() else null end",
      "where id = ? and lead_id = ? and status = 'draft'",
      "and title = ? and body = ?",
      "and body !~ ?",
      "status <> 'lost' and nullif(trim(email), '') is not null",
      "update job_files set shared_at = now() where id = ? and lead_id = ? and exists (select 1 from sent)",
      "'Sent \"' || title || '\"'",
    ]) expect(s).toContain(part);
  });
  it("binds the rendered title and body and the shared marker pattern", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.markSent(input)).toBe(false);
    const binds = sql.mock.calls[0].slice(1);
    expect(binds).toContain("Final text");
    expect(binds).toContain(MARKER_SOURCE);
  });
  it("never queries for malformed ids", async () => {
    expect(await store.markSent({ ...input, fileId: "x" })).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("voidDocument", () => {
  it("voids a sent, unanswered document or a completed view document, unshares its file and logs, in ONE statement", async () => {
    sql.mockResolvedValueOnce([{ file_id: FILE }]);
    expect(await store.voidDocument(JOB, DOC, "o")).toBe(true);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "set status = 'void', voided_at = now()",
      "where id = ? and lead_id = ? and (status = 'sent' or (status = 'completed' and response = 'view'))",
      "not exists (select 1 from document_acknowledgements a where a.file_id = job_documents.file_id)",
      "not exists (select 1 from contract_signatures s where s.file_id = job_documents.file_id)",
      "update job_files set shared_at = null where id = (select file_id from voided) and lead_id = ?",
      "'Voided \"' || title || '\"'",
    ]) expect(s).toContain(part);
  });
  it("answers false when nothing was voided (signed, acknowledged, draft, or another job's)", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.voidDocument(JOB, DOC, "o")).toBe(false);
  });
});
