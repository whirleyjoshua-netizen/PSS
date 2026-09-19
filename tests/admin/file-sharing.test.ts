import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { deleteFile, listFiles, listSharedDocuments, listSharedPhotos, setDocType, setShared, toFile } = await import("@/lib/admin/files");
const { del } = await import("@vercel/blob");
const actions = await import("@/app/admin/jobs/measure-actions");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
});

describe("toFile", () => {
  it("maps shared_at, and a missing column to null", () => {
    expect(toFile({ id: FILE, shared_at: "2026-09-13T10:00:00Z", size_bytes: "5" }).sharedAt).toEqual(new Date("2026-09-13T10:00:00Z"));
    expect(toFile({ id: FILE, size_bytes: "5" }).sharedAt).toBeNull();
  });

  it("maps doc_type, and a missing column to null", () => {
    expect(toFile({ id: FILE, doc_type: "quote", size_bytes: "5" }).docType).toBe("quote");
    expect(toFile({ id: FILE, size_bytes: "5" }).docType).toBeNull();
  });
});

describe("setShared", () => {
  it("shares a photo or a document on that job, logging it in the same statement", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(true);

    const call = sql.mock.calls[0];
    expect(text(call)).toContain("update job_files");
    expect(text(call)).toContain("kind in ('photo','document')");
    expect(text(call)).toContain("insert into job_events");
    expect(call).toEqual(expect.arrayContaining([JOB, FILE, true, "owner@example.com"]));
  });

  it("keeps the lead_id guard, so one job's file cannot be shared onto another", async () => {
    sql.mockResolvedValue([]);
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(false);
    const call = sql.mock.calls[0];
    expect(text(call)).toContain("where id = ? and lead_id = ?");
    // The job id is bound immediately after the file id, so the guard compares
    // lead_id against this job and not some value the caller controls.
    expect(call.indexOf(JOB)).toBe(call.indexOf(FILE) + 1);
  });

  it("names the file in the log without calling a document a photo", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setShared(JOB, FILE, true, "owner@example.com");
    const call = sql.mock.calls[0];
    expect(text(call)).toContain("|| name ||");
    expect(call).toEqual(expect.arrayContaining(["Shared ", " with customer"]));
    // `call` is the array of template values, so this checks that no bound value
    // IS the string "Shared photo " — not that it contains it as a substring.
    expect(call.filter((value) => value === "Shared photo ")).toEqual([]);
  });

  it("logs stopping, with its own wording, and clears shared_at", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setShared(JOB, FILE, false, "owner@example.com");
    expect(text(sql.mock.calls[0])).toContain("else null end");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([false, "Stopped sharing ", ""]));
    // Again an element check, not a substring one: no bound value equals this.
    expect(sql.mock.calls[0].filter((value) => value === "Stopped sharing photo ")).toEqual([]);
  });

  it("returns false for another job's file, or a bad id", async () => {
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(false);
    expect(await setShared(JOB, "nope", true, "owner@example.com")).toBe(false);
  });
});

describe("listSharedPhotos", () => {
  it("returns only shared photos for the job, newest first", async () => {
    await listSharedPhotos(JOB);
    const t = text(sql.mock.calls[0]);
    expect(t).toContain("kind = 'photo'");
    expect(t).toContain("shared_at is not null");
    expect(t).toContain("order by created_at desc");
    expect(sql.mock.calls[0]).toContain(JOB);
  });

  it("returns nothing for a bad id without querying", async () => {
    expect(await listSharedPhotos("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("setDocType", () => {
  it("labels the file on that job and logs it, without touching shared_at", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    expect(await setDocType(JOB, FILE, "quote", "owner@example.com")).toBe(true);

    const call = sql.mock.calls[0];
    expect(text(call)).toContain("update job_files");
    expect(text(call)).toContain("doc_type =");
    expect(text(call)).toContain("where id = ? and lead_id = ?");
    expect(text(call)).toContain("insert into job_events");
    expect(text(call)).not.toContain("shared_at");
    expect(call).toEqual(expect.arrayContaining([JOB, FILE, "quote", "owner@example.com"]));
  });

  it("labels documents only, so a photo cannot carry a document type", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setDocType(JOB, FILE, "quote", "owner@example.com");
    expect(text(sql.mock.calls[0])).toContain("kind = 'document'");
  });

  it("writes the log body wording, naming the file and its label", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setDocType(JOB, FILE, "quote", "owner@example.com");
    expect(text(sql.mock.calls[0])).toContain("|| name ||");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Labelled ", " as Quote"]));

    sql.mockClear();
    await setDocType(JOB, FILE, "po", "owner@example.com");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([" as PO"]));

    sql.mockClear();
    await setDocType(JOB, FILE, null, "owner@example.com");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Removed the type label from ", ""]));
  });

  it("clears the label", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    expect(await setDocType(JOB, FILE, null, "owner@example.com")).toBe(true);
    expect(sql.mock.calls[0]).toContain(null);
    expect(text(sql.mock.calls[0])).not.toContain("shared_at");
  });

  it("returns false when nothing matched, or for a bad id without querying", async () => {
    sql.mockResolvedValue([]);
    expect(await setDocType(JOB, FILE, "po", "owner@example.com")).toBe(false);
    sql.mockClear();
    expect(await setDocType(JOB, "nope", "po", "owner@example.com")).toBe(false);
    expect(await setDocType("nope", FILE, "po", "owner@example.com")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("listSharedDocuments", () => {
  it("returns only shared documents for the job, newest first", async () => {
    await listSharedDocuments(JOB);
    const t = text(sql.mock.calls[0]);
    expect(t).toContain("kind = 'document'");
    expect(t).toContain("shared_at is not null");
    expect(t).toContain("order by created_at desc");
    expect(sql.mock.calls[0]).toContain(JOB);
  });

  it("returns nothing for a bad id without querying", async () => {
    expect(await listSharedDocuments("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("setFileShared action", () => {
  it("checks the session first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.setFileShared(JOB, FILE, true)).rejects.toThrow("NEXT_REDIRECT");
    expect(sql).not.toHaveBeenCalled();
  });

  it("shares as the signed-in owner", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await actions.setFileShared(JOB, FILE, true);
    expect(sql.mock.calls[0]).toContain("owner@example.com");
  });
});

describe("setFileDocType action", () => {
  it("checks the session first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.setFileDocType(JOB, FILE, "quote")).rejects.toThrow("NEXT_REDIRECT");
    expect(sql).not.toHaveBeenCalled();
  });

  it("labels as the signed-in owner, and never touches shared_at", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await actions.setFileDocType(JOB, FILE, "quote");
    expect(sql.mock.calls[0]).toContain("owner@example.com");
    expect(sql.mock.calls[0]).toContain("quote");
    expect(text(sql.mock.calls[0])).not.toContain("shared_at");
  });

  it("clears the label", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await actions.setFileDocType(JOB, FILE, null);
    expect(sql.mock.calls[0]).toContain(null);
  });
});

/**
 * A small model of the two statements that must respect a signature. It does not match the
 * guard as a string and answer yes or no: it reads the `not exists` clause's predicates out
 * of the statement and evaluates them against the rows below, so what comes back is the row
 * set that WHERE would produce. Delete the clause and it lets every file through; widen it
 * (drop its inner where) and it refuses the unsigned file too, because another file on the
 * job is signed. A predicate it does not recognise throws rather than guessing.
 */
describe("a signed contract is frozen", () => {
  const ORIGINAL = "11111111-1111-4111-8111-111111111111";
  const STAMPED = "22222222-2222-4222-8222-222222222222";
  const PLAIN = "33333333-3333-4333-8333-333333333333";
  const OTHER_SIGNED = "44444444-4444-4444-8444-444444444444";

  type Row = {
    id: string; lead_id: string; kind: string; name: string; blob_pathname: string; shared: boolean; doc_type: string;
  };
  let files: Row[];
  const signatures = [
    { file_id: ORIGINAL, signed_file_id: STAMPED },
    // A second contract on the job, signed with no stamped copy: a widened guard that no
    // longer compares ids would refuse PLAIN because this row exists.
    { file_id: OTHER_SIGNED, signed_file_id: null },
  ];

  /** The bound value that directly follows the template text ending in `suffix`. */
  function after(strings: TemplateStringsArray, values: unknown[], suffix: RegExp) {
    const index = strings.findIndex((part) => suffix.test(part));
    if (index < 0 || index >= values.length) throw new Error(`no value after ${suffix}`);
    return values[index];
  }

  /** Evaluates the statement's `not exists (select 1 from contract_signatures s …)`, if any. */
  const SUBQUERY = String.raw`\(\s*select 1 from contract_signatures s\s*(?:where\s+([^()]*?))?\s*\)`;

  /** Evaluates `exists (select 1 from contract_signatures s [where …])` for one file. */
  function namedBySignature(where: string | undefined, fileId: string) {
    if (where === undefined) return signatures.length > 0;
    const predicates = where.split(/\s+or\s+/).map((part) => {
      const match = /^s\.(file_id|signed_file_id) = job_files\.id$/.exec(part.trim());
      if (!match) throw new Error(`unmodelled predicate: ${part}`);
      return match[1] as "file_id" | "signed_file_id";
    });
    return signatures.some((sig) => predicates.some((column) => sig[column] === fileId));
  }

  /** Evaluates the statement's `not exists (…)` guard, if it has one. */
  function passesSignatureGuard(text: string, fileId: string) {
    const clause = new RegExp(String.raw`not exists\s*${SUBQUERY}`).exec(text);
    return clause ? !namedBySignature(clause[1], fileId) : true;
  }

  /** Evaluates listFiles' `exists (…) as signed` column; a statement without it yields no column. */
  function signedColumn(text: string, fileId: string) {
    const column = new RegExp(String.raw`(?<!not )exists\s*${SUBQUERY}\s*as signed`).exec(text);
    return column ? namedBySignature(column[1], fileId) : undefined;
  }

  beforeEach(() => {
    files = [ORIGINAL, STAMPED, PLAIN, OTHER_SIGNED].map((id) => ({
      id, lead_id: JOB, kind: "document", name: `${id}.pdf`, blob_pathname: `jobs/${JOB}/${id}.pdf`, shared: true,
      doc_type: "contract",
    }));
    vi.mocked(del).mockReset().mockResolvedValue(undefined as never);
    sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (text.includes("update job_files set doc_type")) {
        const id = after(strings, values, /where id = $/) as string;
        const lead = after(strings, values, /and lead_id = $/);
        const row = files.find((f) => f.id === id && f.lead_id === lead && f.kind === "document");
        if (!row || !passesSignatureGuard(text, id)) return [];
        row.doc_type = values[0] as string;
        return [{ lead_id: row.lead_id }];
      }
      if (/from job_files where lead_id = \?/.test(text)) {
        return files.filter((f) => f.lead_id === values[0]).map((f) => ({
          id: f.id, lead_id: f.lead_id, kind: f.kind, name: f.name, size_bytes: 1, created_at: "2026-09-18T10:00:00Z",
          blob_pathname: f.blob_pathname, doc_type: f.doc_type, signed: signedColumn(text, f.id),
        }));
      }
      if (text.includes("update job_files")) {
        const id = after(strings, values, /where id = $/) as string;
        const lead = after(strings, values, /and lead_id = $/);
        const shared = values[0] as boolean;
        // `(${shared} or not exists …)` lets sharing through; anything else must pass the guard.
        const bypass = /\(\? or not exists/.test(text) && after(strings, values, /\($/) === true;
        const row = files.find((f) => f.id === id && f.lead_id === lead && ["photo", "document"].includes(f.kind));
        if (!row || (!bypass && !passesSignatureGuard(text, id))) return [];
        row.shared = shared;
        return [{ lead_id: row.lead_id }];
      }
      if (text.includes("delete from job_files")) {
        const id = after(strings, values, /where id = $/) as string;
        const row = files.find((f) => f.id === id);
        if (!row || !passesSignatureGuard(text, id)) return [];
        files = files.filter((f) => f !== row);
        return [{ blob_pathname: row.blob_pathname }];
      }
      throw new Error(`unmodelled statement: ${text}`);
    });
  });

  it("refuses to unshare a signed contract or its stamped copy, and leaves both shared", async () => {
    expect(await setShared(JOB, ORIGINAL, false, "owner@example.com")).toBe(false);
    expect(await setShared(JOB, STAMPED, false, "owner@example.com")).toBe(false);
    expect(files.filter((f) => f.id === ORIGINAL || f.id === STAMPED).map((f) => f.shared)).toEqual([true, true]);
  });

  it("still unshares a file nobody has signed", async () => {
    expect(await setShared(JOB, PLAIN, false, "owner@example.com")).toBe(true);
    expect(files.find((f) => f.id === PLAIN)?.shared).toBe(false);
  });

  it("still lets a signed contract be shared, which changes nothing", async () => {
    expect(await setShared(JOB, ORIGINAL, true, "owner@example.com")).toBe(true);
    expect(await setShared(JOB, STAMPED, true, "owner@example.com")).toBe(true);
  });

  it("refuses to delete a signed contract or its stamped copy, and keeps their bytes", async () => {
    expect(await deleteFile(ORIGINAL, "owner@example.com")).toBe(false);
    expect(await deleteFile(STAMPED, "owner@example.com")).toBe(false);
    expect(files.map((f) => f.id)).toEqual(expect.arrayContaining([ORIGINAL, STAMPED]));
    expect(del).not.toHaveBeenCalled();
  });

  it("still deletes a file nobody has signed, bytes and all", async () => {
    expect(await deleteFile(PLAIN, "owner@example.com")).toBe(true);
    expect(files.map((f) => f.id)).not.toContain(PLAIN);
    expect(del).toHaveBeenCalledWith(`jobs/${JOB}/${PLAIN}.pdf`);
  });

  it("refuses to relabel a signed contract or its stamped copy, and keeps both as contracts", async () => {
    expect(await setDocType(JOB, ORIGINAL, "other", "owner@example.com")).toBe(false);
    expect(await setDocType(JOB, STAMPED, null, "owner@example.com")).toBe(false);
    expect(files.filter((f) => f.id === ORIGINAL || f.id === STAMPED).map((f) => f.doc_type)).toEqual(["contract", "contract"]);
  });

  it("still relabels a file nobody has signed", async () => {
    expect(await setDocType(JOB, PLAIN, "quote", "owner@example.com")).toBe(true);
    expect(files.find((f) => f.id === PLAIN)?.doc_type).toBe("quote");
  });

  it("marks exactly the signed original and its stamped copy as signed, in one statement", async () => {
    const listed = await listFiles(JOB);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(listed.map((f) => [f.id, f.signed]))).toEqual({
      [ORIGINAL]: true, [STAMPED]: true, [PLAIN]: false, [OTHER_SIGNED]: true,
    });
  });

  it("carries the clause in both statements (a tripwire beside the tests above, not a proof)", async () => {
    await setShared(JOB, PLAIN, false, "owner@example.com");
    await deleteFile(PLAIN, "owner@example.com");
    await setDocType(JOB, ORIGINAL, "other", "owner@example.com");
    for (const call of sql.mock.calls) expect(text(call)).toContain("from contract_signatures s");
  });
});
