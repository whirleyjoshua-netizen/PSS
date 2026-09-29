import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => query }));
vi.mock("@/lib/admin/files", () => ({
  listSharedDocuments: vi.fn(),
  readFile: vi.fn(),
}));
// Hoisted here so later additions to lib/portal/sign.ts that store blobs never reach real storage.
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));

import { del, put } from "@vercel/blob";
import { listSharedDocuments, readFile } from "@/lib/admin/files";
import {
  listSignatures, recordSignature, signableContracts, signatureFor, storeSignedCopy,
} from "@/lib/portal/sign";

const JOB = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const STAMPED = "33333333-3333-4333-8333-333333333333";
// The known SHA-256 of the ASCII bytes "pdf bytes".
const PDF_BYTES_SHA256 = "d1cb546b102fab8362de413fdacc187b05be10df72b72db3b3e50b4953f6a555";

const doc = (id: string, name: string, docType: string) => ({
  id, leadId: JOB, createdAt: new Date(), uploadedBy: "owner@example.com",
  kind: "document" as const, name, contentType: "application/pdf",
  sizeBytes: 10, blobPathname: `jobs/${JOB}/${id}`, sharedAt: new Date(),
  docType: docType as never,
});

beforeEach(() => {
  query.mockReset();
  vi.mocked(listSharedDocuments).mockReset();
  vi.mocked(readFile).mockReset();
  vi.mocked(put).mockReset();
  vi.mocked(del).mockReset().mockResolvedValue(undefined);
});

describe("signableContracts", () => {
  it("offers a shared contract that has not been signed", async () => {
    vi.mocked(listSharedDocuments).mockResolvedValue([doc(FILE, "Contract.pdf", "contract")]);
    query.mockResolvedValue([]);
    expect((await signableContracts(JOB)).map((file) => file.id)).toEqual([FILE]);
    expect(listSharedDocuments).toHaveBeenCalledWith(JOB);
    expect(query.mock.calls[0]).toContain(JOB);
  });

  it("never offers a quote", async () => {
    vi.mocked(listSharedDocuments).mockResolvedValue([doc(FILE, "Quote.pdf", "quote")]);
    query.mockResolvedValue([]);
    expect(await signableContracts(JOB)).toEqual([]);
  });

  it("never offers a contract that is already signed", async () => {
    vi.mocked(listSharedDocuments).mockResolvedValue([doc(FILE, "Contract.pdf", "contract")]);
    query.mockResolvedValue([{ file_id: FILE, signed_file_id: null }]);
    expect(await signableContracts(JOB)).toEqual([]);
  });

  // The signature output is itself a shared file with doc_type 'contract'. Without this it
  // would be offered for signing, and so would its own stamped copy, forever.
  it("never offers a signature output", async () => {
    vi.mocked(listSharedDocuments).mockResolvedValue([
      doc(FILE, "Contract.pdf", "contract"),
      doc(STAMPED, "Contract (signed).pdf", "contract"),
    ]);
    query.mockResolvedValue([{ file_id: FILE, signed_file_id: STAMPED }]);
    expect(await signableContracts(JOB)).toEqual([]);
  });

  // A sign job document's PDF is a contract-typed file too; the portal words it as a document.
  it("carries the job document's title and kind for its PDF, and none for a quote contract", async () => {
    const DOCUMENT_FILE = "44444444-4444-4444-8444-444444444444";
    vi.mocked(listSharedDocuments).mockResolvedValue([
      doc(FILE, "Contract PSS-1048 v1.pdf", "contract"),
      doc(DOCUMENT_FILE, "Change order — PSS-1048.pdf", "contract"),
    ]);
    query.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("from job_documents")
        ? [{ file_id: DOCUMENT_FILE, title: "Change order — PSS-1048", kind: "change_order" }]
        : []);
    const offered = await signableContracts(JOB);
    expect(offered.map((file) => [file.id, file.document])).toEqual([
      [FILE, null],
      [DOCUMENT_FILE, { title: "Change order — PSS-1048", kind: "change_order" }],
    ]);
    const documents = query.mock.calls.find(([strings]) => (strings as TemplateStringsArray).join("?").includes("from job_documents"))!;
    expect(documents.slice(1)).toEqual([JOB]);
  });
});

describe("listSignatures", () => {
  it("names the job document each signature was on, if any", async () => {
    query.mockResolvedValue([
      { id: "s1", lead_id: JOB, file_id: FILE, signed_name: "Jane", signed_email: "j@x.com", signed_at: new Date(), doc_sha256: "h", signed_file_id: null, document_title: null },
      { id: "s2", lead_id: JOB, file_id: STAMPED, signed_name: "Jane", signed_email: "j@x.com", signed_at: new Date(), doc_sha256: "h", signed_file_id: null, document_title: "Change order — PSS-1048" },
    ]);
    const signatures = await listSignatures(JOB);
    expect(signatures.map((s) => s.documentTitle)).toEqual([null, "Change order — PSS-1048"]);
    const statement = (query.mock.calls[0][0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
    expect(statement).toContain("left join job_documents d on d.file_id = s.file_id");
    expect(query.mock.calls[0].slice(1)).toEqual([JOB]);
  });
});

describe("recordSignature", () => {
  const bytes = new TextEncoder().encode("pdf bytes");
  const file = doc(FILE, "Contract.pdf", "contract");

  it("writes the row with the SHA-256 of the bytes actually served", async () => {
    vi.mocked(readFile).mockResolvedValue({
      stream: new Response(bytes).body!, contentType: "application/pdf",
    });
    query.mockResolvedValue([{ id: "row" }]);

    const result = await recordSignature({
      jobId: JOB, file, name: "  Jane Doe  ", email: "jane@example.com",
      ip: "203.0.113.4", userAgent: "test-agent",
    });

    expect(result).toBe("signed");
    expect(readFile).toHaveBeenCalledWith(file);
    expect(query).toHaveBeenCalledTimes(1);
    // Behaviour: the values that reached the one statement, in the order the columns name them.
    const values = query.mock.calls[0].slice(1);
    expect(values.slice(1, 8)).toEqual([
      JOB, FILE, "Jane Doe", "jane@example.com", "203.0.113.4", "test-agent", PDF_BYTES_SHA256,
    ]);
    expect(values[0]).toMatch(/^[0-9a-f-]{36}$/);
    // Tripwires on the statement's shape, alongside the behavioural assertion above.
    const sql = query.mock.calls[0][0].join("?");
    expect(sql).toContain("insert into contract_signatures");
    expect(sql).toContain("on conflict (file_id) do nothing");
    expect(sql).toContain("'signature'");
    // The timeline body names the DOCUMENT, never the typed name: nothing a customer typed
    // reaches the owners' permanent record.
    // The typed name is bound once, as signed_name data; the timeline body (the last value)
    // is built from the document's name alone.
    expect(values.at(-1)).toBe('Signed "Contract.pdf" from their project page');
    expect(query.mock.calls[0]).toContainEqual(expect.stringContaining("Contract.pdf"));
    expect(values.filter((value) => String(value).includes("Jane Doe"))).toEqual(["Jane Doe"]);
    expect(query.mock.calls[0][0].join("")).not.toContain("Jane Doe");
  });

  it("in the SAME statement, marks a generated contract's version signed and moves the job to Sold", async () => {
    vi.mocked(readFile).mockResolvedValue({ stream: new Response("pdf bytes").body!, contentType: "application/pdf" });
    query.mockResolvedValue([{ id: "s1", lead_id: JOB, file_id: FILE, signed_name: "A", signed_email: "a@x", signed_at: new Date(), doc_sha256: "x", signed_file_id: null }]);
    await recordSignature({ jobId: JOB, file: doc(FILE, "Contract PSS-1042 v1.pdf", "contract"), name: "A", email: "a@x", ip: null, userAgent: null });
    expect(query).toHaveBeenCalledTimes(1);
    const s = (query.mock.calls[0][0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
    expect(s).toContain("update dc_quote_versions set status = 'signed'");
    expect(s).toContain("contract_file_id = (select file_id from signed)");
    expect(s).toContain("sold_cents");
    expect(s).toContain("status in ('new','visit_booked','quoted')");
    // The stage event is attributed to the signer, bound once more before the timeline body.
    expect(query.mock.calls[0].slice(1).slice(-3)).toEqual([
      "a@x", "a@x", 'Signed "Contract PSS-1042 v1.pdf" from their project page',
    ]);
  });

  it("in the SAME statement, completes a sent sign document whose PDF this is", async () => {
    vi.mocked(readFile).mockResolvedValue({ stream: new Response("pdf bytes").body!, contentType: "application/pdf" });
    query.mockResolvedValue([{ id: "sig" }]);
    await recordSignature({ jobId: JOB, file: doc(FILE, "Change order.pdf", "contract"), name: "Jane Doe", email: "jane@example.com", ip: null, userAgent: null });
    const s = (query.mock.calls[0][0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
    expect(s).toContain("update job_documents set status = 'completed', completed_at = now(), updated_at = now()");
    expect(s).toContain("where file_id = (select file_id from signed) and lead_id = (select lead_id from signed) and status = 'sent' and response = 'sign'");
    // The event body is still the statement's last value: the new CTE binds nothing.
    expect(query.mock.calls[0].slice(1).at(-1)).toBe('Signed "Change order.pdf" from their project page');
  });

  it("refuses an empty name without touching the database", async () => {
    const result = await recordSignature({
      jobId: JOB, file, name: "   ", email: "jane@example.com", ip: null, userAgent: null,
    });
    expect(result).toBe("invalid");
    expect(query).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("tells the caller a repeat submission wrote nothing, so it emails nobody", async () => {
    vi.mocked(readFile).mockResolvedValue({
      stream: new Response(bytes).body!, contentType: "application/pdf",
    });
    query.mockResolvedValue([]); // on conflict do nothing returned no row
    const result = await recordSignature({
      jobId: JOB, file, name: "Jane Doe", email: "jane@example.com", ip: null, userAgent: null,
    });
    expect(result).toBe("already-signed");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("answers not-found when the bytes cannot be read", async () => {
    vi.mocked(readFile).mockResolvedValue(null);
    const result = await recordSignature({
      jobId: JOB, file, name: "Jane Doe", email: "jane@example.com", ip: null, userAgent: null,
    });
    expect(result).toBe("not-found");
    expect(query).not.toHaveBeenCalled();
  });
});

describe("storeSignedCopy", () => {
  const original = doc(FILE, "Contract.pdf", "contract");
  const bytes = Buffer.from("stamped");
  const input = { jobId: JOB, original, bytes, actor: "jane@example.com" };

  it("stores the stamped bytes privately under the job and returns the new row", async () => {
    vi.mocked(put).mockResolvedValue(undefined as never);
    query.mockResolvedValue([{ id: STAMPED }]);

    const id = await storeSignedCopy(input);

    expect(id).toBe(STAMPED);
    expect(put).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = vi.mocked(put).mock.calls[0];
    expect(pathname).toMatch(new RegExp(`^jobs/${JOB}/[0-9a-f-]{36}-signed\.pdf$`));
    expect(body).toBe(bytes);
    expect(options).toEqual({
      access: "private", contentType: "application/pdf", addRandomSuffix: false,
    });
    expect(del).not.toHaveBeenCalled();

    // One statement: the row and the link cannot come apart.
    expect(query).toHaveBeenCalledTimes(1);
    const values = query.mock.calls[0].slice(1);
    // The row's id is the blob's id, and it is written with the stored path and size.
    const rowId = (pathname as string).split("/")[2].replace("-signed.pdf", "");
    expect(values).toContain(rowId);
    expect(values).toContain(pathname);
    expect(values).toContain(bytes.length);
    expect(values).toContain("Contract (signed).pdf");
    expect(values).toContain(JOB);
    expect(values).toContain(FILE);
    expect(values).toContain("jane@example.com");
    // Tripwires beside the real assertions: shared as a contract, and linked to the signature.
    const sql = query.mock.calls[0][0].join("?");
    expect(sql).toContain("shared_at");
    expect(sql).toContain("'contract'");
    expect(sql).toContain("update contract_signatures set signed_file_id");
  });

  it("names the copy after the original whatever the extension's case", async () => {
    vi.mocked(put).mockResolvedValue(undefined as never);
    query.mockResolvedValue([{ id: STAMPED }]);
    await storeSignedCopy({ ...input, original: doc(FILE, "Deal.PDF", "contract") });
    expect(query.mock.calls[0].slice(1)).toContain("Deal (signed).pdf");
  });

  it("answers null and writes nothing when the bytes cannot be stored", async () => {
    vi.mocked(put).mockRejectedValue(new Error("blob down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await storeSignedCopy(input)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("removes the stored bytes when the row cannot be written", async () => {
    vi.mocked(put).mockResolvedValue(undefined as never);
    query.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await storeSignedCopy(input)).toBeNull();
    expect(del).toHaveBeenCalledWith(vi.mocked(put).mock.calls[0][0]);
  });

  // No pending signature on this job (never signed, another job's file, or already stamped):
  // no row is created, so no orphaned bytes may be left behind either.
  it("removes the stored bytes when there is no unstamped signature to link", async () => {
    vi.mocked(put).mockResolvedValue(undefined as never);
    query.mockResolvedValue([]);
    expect(await storeSignedCopy(input)).toBeNull();
    expect(del).toHaveBeenCalledWith(vi.mocked(put).mock.calls[0][0]);
  });
});

describe("signatureFor", () => {
  it("maps the stored row", async () => {
    const signedAt = new Date();
    query.mockResolvedValue([{
      id: "sig", lead_id: JOB, file_id: FILE, signed_name: "Jane Doe",
      signed_email: "jane@example.com", signed_at: signedAt, doc_sha256: PDF_BYTES_SHA256,
      signed_file_id: STAMPED,
    }]);
    expect(await signatureFor(FILE)).toEqual({
      id: "sig", leadId: JOB, fileId: FILE, signedName: "Jane Doe",
      signedEmail: "jane@example.com", signedAt, docSha256: PDF_BYTES_SHA256,
      signedFileId: STAMPED,
    });
    expect(query.mock.calls[0].slice(1)).toEqual([FILE]);
  });

  it("answers null when the contract is unsigned", async () => {
    query.mockResolvedValue([]);
    expect(await signatureFor(FILE)).toBeNull();
  });
});
