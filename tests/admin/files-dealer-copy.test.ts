import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn().mockResolvedValue(undefined), get: vi.fn() }));
const files = await import("@/lib/admin/files");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
beforeEach(() => sql.mockReset());

describe("createFile with a doc type", () => {
  it("writes the doc type in the same insert", async () => {
    sql.mockResolvedValueOnce([{ id: JOB }]).mockResolvedValueOnce([{ id: FILE, lead_id: JOB, created_at: new Date(), size_bytes: 1, doc_type: "dealer_copy" }]);
    await files.createFile({ leadId: JOB, kind: "document", name: "DEALER COPY 1.html", contentType: "text/html",
      body: new Blob(["x"]), actor: "Direct Connect", docType: "dealer_copy" });
    const insert = sql.mock.calls[1];
    expect(text(insert)).toContain("doc_type");
    expect(insert).toContain("dealer_copy");
  });

  it("writes null when no doc type is given, so existing callers are unchanged", async () => {
    sql.mockResolvedValueOnce([{ id: JOB }]).mockResolvedValueOnce([{ id: FILE, lead_id: JOB, created_at: new Date(), size_bytes: 1 }]);
    await files.createFile({ leadId: JOB, kind: "document", name: "Quote.pdf", contentType: "application/pdf",
      body: new Blob(["x"]), actor: "owner@example.com" });
    const insert = sql.mock.calls[1];
    // Binds: id, lead, actor, kind, name, content type, size, pathname, doc type, then the event's.
    const binds = insert.slice(1);
    expect(binds[7]).toMatch(/^jobs\//);
    expect(binds[8]).toBeNull();
  });
});

describe("setShared", () => {
  it("never matches a Dealer Copy, even before the database check", async () => {
    sql.mockResolvedValue([]);
    await files.setShared(JOB, FILE, true, "o@x.com");
    expect(text(sql.mock.calls[0])).toContain("doc_type is distinct from 'dealer_copy'");
  });
});

describe("setShared on a generated contract", () => {
  it("refuses sharing a contract a superseded quote version names, but still lets it be unshared", async () => {
    sql.mockResolvedValue([]);
    expect(await files.setShared(JOB, FILE, true, "o@x.com")).toBe(false);
    const statement = text(sql.mock.calls[0]);
    const update = statement.slice(statement.indexOf("update job_files"), statement.indexOf("returning"));
    expect(update).toContain(
      "and (not ? or not exists ( select 1 from dc_quote_versions v where v.contract_file_id = job_files.id and v.status = 'superseded' ))",
    );
  });
});

describe("setDocType", () => {
  it("never relabels a Dealer Copy", async () => {
    sql.mockResolvedValue([]);
    await files.setDocType(JOB, FILE, "quote", "o@x.com");
    expect(text(sql.mock.calls[0])).toContain("doc_type is distinct from 'dealer_copy'");
  });

  it("a Dealer Copy cannot be relabelled (so it can then never be shared): the refusal is on the row being updated", async () => {
    sql.mockResolvedValue([]);
    await files.setDocType(JOB, FILE, "other", "o@x.com");
    // The clause sits in the update's own where, before the event insert, so it tests the
    // row's CURRENT label rather than anything else.
    const statement = text(sql.mock.calls[0]);
    const update = statement.slice(statement.indexOf("update job_files"), statement.indexOf("returning"));
    expect(update).toContain("and doc_type is distinct from 'dealer_copy'");
  });

  it("never relabels a contract a quote version names, whatever that version's status", async () => {
    sql.mockResolvedValue([]);
    expect(await files.setDocType(JOB, FILE, "other", "o@x.com")).toBe(false);
    const statement = text(sql.mock.calls[0]);
    const update = statement.slice(statement.indexOf("update job_files"), statement.indexOf("returning"));
    expect(update).toContain("and not exists ( select 1 from dc_quote_versions v where v.contract_file_id = job_files.id )");
  });

  it("refuses dealer_copy as a new label without querying, whatever the form sends", async () => {
    expect(await files.setDocType(JOB, FILE, "dealer_copy" as never, "o@x.com")).toBe(false);
    expect(await files.setDocType(JOB, FILE, "anything" as never, "o@x.com")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("deleteFile", () => {
  it("refuses a file a Direct Connect quote version names, as its source or its contract", async () => {
    sql.mockResolvedValue([]);
    expect(await files.deleteFile(FILE, "o@x.com")).toBe(false);
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain(
      "not exists ( select 1 from dc_quote_versions v where v.source_file_id = job_files.id or v.contract_file_id = job_files.id )",
    );
  });
});
