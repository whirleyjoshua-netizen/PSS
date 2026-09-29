import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => query }));
const readFile = vi.fn();
vi.mock("@/lib/admin/files", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/files")>("@/lib/admin/files");
  return { toFile: actual.toFile, readFile };
});
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));

const { acknowledgeableDocuments, acknowledgementFor, recordAcknowledgement } = await import("@/lib/portal/acknowledge-document");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
// The known SHA-256 of the ASCII bytes "pdf bytes".
const PDF_BYTES_SHA256 = "d1cb546b102fab8362de413fdacc187b05be10df72b72db3b3e50b4953f6a555";
const file = { id: FILE, leadId: JOB, createdAt: new Date(), uploadedBy: "o", kind: "document" as const, name: "SA.pdf",
  contentType: "application/pdf", sizeBytes: 9, blobPathname: `jobs/${JOB}/x`, sharedAt: new Date(), docType: "other" as const };
const document = { id: DOC, title: "Service agreement — PSS-1048", file };
const input = { jobId: JOB, document, name: "  Jane Doe ", email: "jane@example.com", ip: "1.2.3.4", userAgent: "UA" };

beforeEach(() => {
  query.mockReset();
  // A fresh stream per call: a test that records twice would otherwise read a consumed body.
  readFile.mockReset().mockImplementation(async () => ({ stream: new Response("pdf bytes").body, contentType: "application/pdf" }));
});

describe("acknowledgeableDocuments", () => {
  it("lists sent, shared, unanswered acknowledge documents of this job only", async () => {
    query.mockResolvedValueOnce([{ document_id: DOC, title: "SA", id: FILE, lead_id: JOB, created_at: new Date().toISOString(),
      uploaded_by: "o", kind: "document", name: "SA.pdf", content_type: "application/pdf", size_bytes: 9,
      blob_pathname: "p", shared_at: new Date().toISOString(), doc_type: "other" }]);
    const [doc] = await acknowledgeableDocuments(JOB);
    expect(doc).toMatchObject({ id: DOC, title: "SA", file: { id: FILE, leadId: JOB, name: "SA.pdf" } });
    const s = text(query.mock.calls[0]);
    for (const part of ["d.lead_id = ?", "f.lead_id = ?", "d.response = 'acknowledge'", "d.status = 'sent'", "f.shared_at is not null",
      "not exists (select 1 from document_acknowledgements a where a.file_id = f.id)"]) expect(s).toContain(part);
  });
  it("never queries for a malformed job id", async () => {
    expect(await acknowledgeableDocuments("nope")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("recordAcknowledgement", () => {
  it("fingerprints the bytes served and writes record, completion and event in ONE statement", async () => {
    query.mockResolvedValueOnce([{ file_id: FILE }]);
    expect(await recordAcknowledgement(input)).toBe("acknowledged");
    expect(query).toHaveBeenCalledTimes(1);
    const s = text(query.mock.calls[0]);
    for (const part of [
      "insert into document_acknowledgements",
      "d.id = ? and d.lead_id = ? and d.file_id = ? and f.id = d.file_id and f.lead_id = ?",
      "d.response = 'acknowledge' and d.status = 'sent' and f.shared_at is not null",
      "on conflict (file_id) do nothing",
      "update job_documents d set status = 'completed', completed_at = now()",
      "insert into job_events", "'document'",
    ]) expect(s).toContain(part);
    // The completion runs FIRST and the record is inserted only from the row it returned: a void
    // that commits first leaves the update matching nothing, so nothing at all is written.
    expect(s).toMatch(/^ ?with completed as \( update job_documents/);
    expect(s.indexOf("update job_documents")).toBeLessThan(s.indexOf("insert into document_acknowledgements"));
    expect(s).toContain("select ?, lead_id, file_id, ?, ?, ?, ?, ? from completed on conflict (file_id) do nothing");
    expect(s).toContain("from acked ) select file_id from acked");
    const values = query.mock.calls[0].slice(1);
    // The update's guard binds the document, this job, the file and this job again (the file's owner).
    expect(values.slice(0, 4)).toEqual([DOC, JOB, FILE, JOB]);
    expect(values[4]).toMatch(/^[0-9a-f-]{36}$/);
    expect(values.slice(5, 10)).toEqual(["Jane Doe", "jane@example.com", "1.2.3.4", "UA", PDF_BYTES_SHA256]);
    expect(values.at(-1)).toBe('Acknowledged "Service agreement — PSS-1048" from their project page');
    // The typed name is data only: never in the permanent timeline sentence.
    expect(values.filter((v) => String(v).includes("Jane Doe"))).toEqual(["Jane Doe"]);
  });
  it("refuses a blank name without touching the database", async () => {
    expect(await recordAcknowledgement({ ...input, name: "  " })).toBe("invalid");
    expect(query).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });
  it("answers not-found when the bytes cannot be read", async () => {
    readFile.mockResolvedValue(null);
    expect(await recordAcknowledgement(input)).toBe("not-found");
    expect(query).not.toHaveBeenCalled();
  });
  it("tells a repeat (this job's own record exists) from a refusal", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "a", lead_id: JOB, file_id: FILE, acknowledged_name: "J",
      acknowledged_email: "j@x", acknowledged_at: new Date().toISOString(), doc_sha256: "s" }]);
    expect(await recordAcknowledgement(input)).toBe("already-acknowledged");
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await recordAcknowledgement(input)).toBe("not-found");
  });
  it("never reports another job's record as this job's repeat", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "a", lead_id: "99999999-9999-4999-8999-999999999999", file_id: FILE,
      acknowledged_name: "J", acknowledged_email: "j@x", acknowledged_at: new Date().toISOString(), doc_sha256: "s" }]);
    expect(await recordAcknowledgement(input)).toBe("not-found");
  });
});

describe("acknowledgementFor", () => {
  it("maps the row and refuses a malformed id without a query", async () => {
    expect(await acknowledgementFor("x")).toBeNull();
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValueOnce([{ id: "a", lead_id: JOB, file_id: FILE, acknowledged_name: "J", acknowledged_email: "j@x",
      acknowledged_at: "2026-09-28T18:00:00Z", doc_sha256: "s" }]);
    expect(await acknowledgementFor(FILE)).toEqual({ id: "a", leadId: JOB, fileId: FILE, acknowledgedName: "J",
      acknowledgedEmail: "j@x", acknowledgedAt: new Date("2026-09-28T18:00:00Z"), docSha256: "s" });
  });
});
