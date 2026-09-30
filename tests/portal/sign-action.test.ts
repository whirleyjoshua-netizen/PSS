import { beforeEach, describe, expect, it, vi } from "vitest";
import { PNG_DATA_URL_MAX, PNG_DATA_URL_PREFIX } from "@/lib/portal/adoption-limits";
import { corruptPng, pngBytes, pngDataUrl } from "../fixtures/png";

/**
 * The sign action, with everything it calls mocked: no database, no storage, no email. The
 * library itself is tested in sign.test.ts (which mocks the db, not the library, so the action
 * cases live here); this file is about ownership, the file lookup, the identity recorded, and
 * that nothing after the signature can take it away.
 */
const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer, destroyCustomerSession: vi.fn() }));

const signableContracts = vi.fn();
const recordSignature = vi.fn();
const signatureFor = vi.fn();
const storeSignedCopy = vi.fn();
vi.mock("@/lib/portal/sign", () => ({ signableContracts, recordSignature, signatureFor, storeSignedCopy }));

const stampSignature = vi.fn();
vi.mock("@/lib/portal/stamp", () => ({ stampSignature }));

const notifyOwnersOfSignature = vi.fn();
const sendCustomerSignedCopy = vi.fn();
vi.mock("@/lib/portal/send-signature-email", () => ({ notifyOwnersOfSignature, sendCustomerSignedCopy }));

const readFile = vi.fn();
vi.mock("@/lib/admin/files", () => ({ readFile, listSharedDocuments: vi.fn(), listBlobPathnames: vi.fn() }));

// Anything reaching the database from here is a bug the test should see, not a real query.
const query = vi.fn(() => {
  throw new Error("database reached");
});
vi.mock("@/lib/db", () => ({ db: () => query }));

const headerValues: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: async () => new Headers(headerValues),
  cookies: async () => new Map(),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
// after() callbacks are collected, then run and awaited by the test: they run after the response.
const pending: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void pending.push(fn) }));
const runAfter = async () => {
  for (const fn of pending.splice(0)) await fn();
};
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const { signContractAction, signContractFormAction } = await import("@/app/(site)/project/actions");
const { TYPED_NAME_MAX } = await import("@/lib/portal/typed-name");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const MISSING = "00000000-0000-4000-8000-000000000000";
const FILE = "22222222-2222-4222-8222-222222222222";
const EMAIL = "john@example.com";
const SIGNED_AT = new Date("2026-09-18T17:00:00Z");

const job = { id: MINE, name: "John Ramos", projectNo: 1048, status: "sold" };
const contract = { id: FILE, name: "Contract - Living room.pdf", docType: "contract", leadId: MINE };
const signature = {
  signedName: "Jane Doe", signedEmail: EMAIL, signedAt: SIGNED_AT, docSha256: "abc", fileId: FILE, leadId: MINE,
};
const STAMPED = Buffer.from("stamped");
const TYPED_FORM = { method: "typed", initials: "", signatureImage: "", initialsImage: "" };

beforeEach(() => {
  pending.length = 0;
  for (const key of Object.keys(headerValues)) delete headerValues[key];
  for (const fn of [revalidatePath, redirect, query]) fn.mockClear();
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job] });
  signableContracts.mockReset().mockResolvedValue([contract]);
  recordSignature.mockReset().mockResolvedValue("signed");
  signatureFor.mockReset().mockResolvedValue(signature);
  readFile.mockReset().mockImplementation(async () => ({
    stream: new Response("pdf bytes").body,
    contentType: "application/pdf",
  }));
  stampSignature.mockReset().mockResolvedValue(STAMPED);
  storeSignedCopy.mockReset().mockResolvedValue({ id: "stamped" });
  notifyOwnersOfSignature.mockReset().mockResolvedValue(undefined);
  sendCustomerSignedCopy.mockReset().mockResolvedValue(undefined);
});

describe("signContractAction ownership", () => {
  it("refuses a job the customer does not own and writes nothing", async () => {
    expect(await signContractAction(THEIRS, FILE, "Jane Doe", true, TYPED_FORM)).toBe("not-found");
    expect(recordSignature).not.toHaveBeenCalled();
    expect(signableContracts).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("answers a job that does not exist the same way", async () => {
    const missing = await signContractAction(MISSING, FILE, "Jane Doe", true, TYPED_FORM);
    const theirs = await signContractAction(THEIRS, FILE, "Jane Doe", true, TYPED_FORM);
    expect(missing).toBe("not-found");
    expect(theirs).toBe(missing);
    expect(signableContracts).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a signable contract on this job", async () => {
    signableContracts.mockResolvedValue([]);
    signatureFor.mockResolvedValue(null);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("not-found");
    expect(signableContracts).toHaveBeenCalledWith(MINE);
    expect(recordSignature).not.toHaveBeenCalled();
  });

  it("refuses a posted id that is not in the list, even when the list is not empty", async () => {
    signatureFor.mockResolvedValue(null);
    expect(await signContractAction(MINE, "a-quote-id", "Jane Doe", true, TYPED_FORM)).toBe("not-found");
    expect(recordSignature).not.toHaveBeenCalled();
  });

  it("refuses when the box is not ticked", async () => {
    expect(await signContractAction(MINE, FILE, "Jane Doe", false, TYPED_FORM)).toBe("invalid");
    expect(recordSignature).not.toHaveBeenCalled();
  });

  it("refuses a typed name longer than the cap, reading nothing, and takes one at the cap", async () => {
    expect(await signContractAction(MINE, FILE, "a".repeat(TYPED_NAME_MAX + 1), true, TYPED_FORM)).toBe("invalid");
    expect(signableContracts).not.toHaveBeenCalled();
    expect(recordSignature).not.toHaveBeenCalled();
    // Surrounding spaces are not the name: the cap counts what would be recorded.
    expect(await signContractAction(MINE, FILE, ` ${"a".repeat(TYPED_NAME_MAX)} `, true, TYPED_FORM)).toBe("signed");
    expect(recordSignature).toHaveBeenCalledTimes(1);
  });
});

describe("signContractAction repeats", () => {
  it("refuses a non-uuid file id without querying for a signature", async () => {
    signableContracts.mockResolvedValue([]);
    expect(await signContractAction(MINE, "a-quote-id", "Jane Doe", true, TYPED_FORM)).toBe("not-found");
    expect(signatureFor).not.toHaveBeenCalled();
    expect(recordSignature).not.toHaveBeenCalled();
  });

  it("answers a repeat post of this job's signed contract with success, and runs nothing", async () => {
    signableContracts.mockResolvedValue([]);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("signed");
    expect(signatureFor).toHaveBeenCalledWith(FILE);
    expect(recordSignature).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("refuses another job's signed file exactly as a missing one", async () => {
    signableContracts.mockResolvedValue([]);
    signatureFor.mockResolvedValue({ ...signature, leadId: THEIRS });
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("not-found");
    expect(pending).toHaveLength(0);
  });

  it("tells a raced second post it signed, but emails and stamps nothing", async () => {
    recordSignature.mockResolvedValue("already-signed");
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("signed");
    expect(pending).toHaveLength(0);
    await runAfter();
    expect(notifyOwnersOfSignature).not.toHaveBeenCalled();
    expect(sendCustomerSignedCopy).not.toHaveBeenCalled();
    expect(storeSignedCopy).not.toHaveBeenCalled();
  });
});

describe("signContractAction recording", () => {
  it("records the session's email and the listed file, never anything from the form", async () => {
    headerValues["x-forwarded-for"] = "203.0.113.9, 10.0.0.1";
    headerValues["user-agent"] = "TestBrowser/1";
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signatureMethod", "typed");
    form.set("signedName", "Jane Doe");
    form.set("agreed", "on");
    form.set("email", "attacker@example.com");
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=1&file=${FILE}`);
    expect(recordSignature).toHaveBeenCalledWith({
      jobId: MINE, file: contract, name: "Jane Doe", email: EMAIL, ip: "203.0.113.9", userAgent: "TestBrowser/1",
      adoption: { method: "typed", initials: null },
    });
  });

  it("redirects with a plain refusal when the contract is not this job's to sign", async () => {
    signableContracts.mockResolvedValue([]);
    signatureFor.mockResolvedValue(null);
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signatureMethod", "typed");
    form.set("signedName", "Jane Doe");
    form.set("agreed", "on");
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=no&file=${FILE}`);
  });

  it("redirects naming the empty field when the name is only spaces", async () => {
    // recordSignature is the one that trims and refuses the name; the wrapper maps its answer.
    recordSignature.mockResolvedValue("invalid");
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signatureMethod", "typed");
    form.set("signedName", "   ");
    form.set("agreed", "on");
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=missing&file=${FILE}`);
  });

  it("redirects with a refusal when the form arrives without the box ticked", async () => {
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signatureMethod", "typed");
    form.set("signedName", "Jane Doe");
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=missing&file=${FILE}`);
    expect(recordSignature).not.toHaveBeenCalled();
  });

  it("passes a refusal from recordSignature straight back and runs nothing after it", async () => {
    recordSignature.mockResolvedValue("invalid");
    expect(await signContractAction(MINE, FILE, "   ", true, TYPED_FORM)).toBe("invalid");
    expect(pending).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("stamps, stores and emails the copy after answering", async () => {
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("signed");
    // Nothing slow has run yet: the answer does not wait on it.
    expect(stampSignature).not.toHaveBeenCalled();
    await runAfter();
    expect(stampSignature).toHaveBeenCalledWith(Buffer.from("pdf bytes"), {
      signedName: "Jane Doe", signedEmail: EMAIL, signedAt: SIGNED_AT, sha256: "abc", projectNo: "PSS-1048",
    }, { method: "typed", initials: null }, null);
    expect(storeSignedCopy).toHaveBeenCalledWith({ jobId: MINE, original: contract, bytes: STAMPED, actor: EMAIL });
    expect(notifyOwnersOfSignature).toHaveBeenCalledWith(job, contract.name, EMAIL, true, SIGNED_AT, null);
    expect(sendCustomerSignedCopy).toHaveBeenCalledWith(EMAIL, job, contract.name, STAMPED);
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });

  it("tells the owners the job document's title when the signed file is one", async () => {
    const changeOrder = { ...contract, name: "Change order — PSS-1048.pdf", document: { title: "Change order — PSS-1048", kind: "change_order" } };
    signableContracts.mockResolvedValue([changeOrder]);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("signed");
    await runAfter();
    expect(notifyOwnersOfSignature).toHaveBeenCalledWith(job, changeOrder.name, EMAIL, true, SIGNED_AT, "Change order — PSS-1048");
  });

  it("still succeeds when stamping fails, and tells the owners so", async () => {
    stampSignature.mockResolvedValue(null);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("signed");
    await runAfter();
    expect(storeSignedCopy).not.toHaveBeenCalled();
    expect(notifyOwnersOfSignature).toHaveBeenCalledWith(job, contract.name, EMAIL, false, SIGNED_AT, null);
    expect(sendCustomerSignedCopy).toHaveBeenCalledWith(EMAIL, job, contract.name, null);
  });

  it("keeps the signature when the copy cannot be saved and both emails fail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    storeSignedCopy.mockRejectedValue(new Error("blob down"));
    notifyOwnersOfSignature.mockRejectedValue(new Error("resend down"));
    sendCustomerSignedCopy.mockRejectedValue(new Error("resend down"));
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("signed");
    await expect(runAfter()).resolves.toBeUndefined();
    // The owners still hear about it, told the stamped copy is missing.
    expect(notifyOwnersOfSignature).toHaveBeenCalledWith(job, contract.name, EMAIL, false, SIGNED_AT, null);
    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });
});

const MARKS = { initials: [{ page: 1, x: 502, y: 700, section: "4" }], signature: { page: 2, x: 154, y: 300 } };
const marked = { ...contract, signMarks: MARKS };
const SIG = pngBytes(600, 200);
const INI = pngBytes(200, 100);

describe("signContractAction adoption (spec §6)", () => {
  it("requires typed initials when the file has numbered sections, and passes them on", async () => {
    signableContracts.mockResolvedValue([marked]);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("invalid");
    expect(recordSignature).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, { ...TYPED_FORM, initials: " JD " })).toBe("signed");
    expect(recordSignature).toHaveBeenCalledWith(expect.objectContaining({ adoption: { method: "typed", initials: "JD" } }));
    await runAfter();
    expect(stampSignature).toHaveBeenCalledWith(Buffer.from("pdf bytes"), expect.anything(), { method: "typed", initials: "JD" }, MARKS);
  });

  it("refuses initials for a file with no numbered sections (a document with zero sections)", async () => {
    signableContracts.mockResolvedValue([{ ...contract, signMarks: { initials: [], signature: MARKS.signature } }]);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, { ...TYPED_FORM, initials: "JD" })).toBe("invalid");
    expect(recordSignature).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, TYPED_FORM)).toBe("signed");
  });

  it("takes a drawn signature and initials as the exact PNG bytes, and stamps with those bytes", async () => {
    signableContracts.mockResolvedValue([marked]);
    const form = { method: "drawn", initials: "", signatureImage: pngDataUrl(SIG), initialsImage: pngDataUrl(INI) };
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, form)).toBe("signed");
    const { adoption } = recordSignature.mock.calls[0][0];
    expect(adoption.method).toBe("drawn");
    expect(adoption.signaturePng.equals(SIG)).toBe(true);
    expect(adoption.initialsPng.equals(INI)).toBe(true);
    await runAfter();
    expect(stampSignature.mock.calls[0][2]).toBe(adoption);
  });

  it.each([
    ["an oversized PNG", pngDataUrl(pngBytes(1201, 10))],
    ["a JPEG", `data:image/jpeg;base64,${SIG.toString("base64")}`],
    ["bytes that are not a PNG", `${PNG_DATA_URL_PREFIX}${Buffer.from("not a png, just some text!!").toString("base64")}`],
    ["a data URL past the cap", PNG_DATA_URL_PREFIX + "A".repeat(PNG_DATA_URL_MAX)],
  ])("refuses %s before reading anything, and stores nothing", async (_label, signatureImage) => {
    const form = { method: "drawn", initials: "", signatureImage, initialsImage: pngDataUrl(INI) };
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, form)).toBe("invalid");
    expect(signableContracts).not.toHaveBeenCalled();
    expect(recordSignature).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("accepts a header-valid PNG whose data is corrupt: validation reads the header only", async () => {
    signableContracts.mockResolvedValue([marked]);
    const form = { method: "drawn", initials: "", signatureImage: pngDataUrl(corruptPng(600, 200)), initialsImage: pngDataUrl(INI) };
    expect(await signContractAction(MINE, FILE, "Jane Doe", true, form)).toBe("signed");
  });

  it("refuses a missing or unknown method, reading nothing", async () => {
    for (const method of ["", "scribble"]) {
      expect(await signContractAction(MINE, FILE, "Jane Doe", true, { ...TYPED_FORM, method })).toBe("invalid");
    }
    expect(signableContracts).not.toHaveBeenCalled();
  });

  it("with JavaScript off, a plain typed form post signs a document with numbered sections", async () => {
    signableContracts.mockResolvedValue([marked]);
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signatureMethod", "typed");
    form.set("signedName", "Jane Doe");
    form.set("signedInitials", "JD");
    form.set("agreed", "on");
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=1&file=${FILE}`);
    expect(recordSignature).toHaveBeenCalledWith(expect.objectContaining({ adoption: { method: "typed", initials: "JD" } }));
  });

  it("reads the drawn fields from the form", async () => {
    signableContracts.mockResolvedValue([marked]);
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signatureMethod", "drawn");
    form.set("signedName", "Jane Doe");
    form.set("signatureImage", pngDataUrl(SIG));
    form.set("initialsImage", pngDataUrl(INI));
    form.set("agreed", "on");
    await expect(signContractFormAction(form)).rejects.toThrow("signed=1");
    expect(recordSignature.mock.calls[0][0].adoption.method).toBe("drawn");
  });

  it.each([
    ["a drawn signature that is not a PNG", { signatureMethod: "drawn", signatureImage: `data:image/jpeg;base64,${SIG.toString("base64")}` }],
    ["typed without the initials the file's sections need", { signatureMethod: "typed" }],
  ])("redirects naming the missing field for %s, and records nothing", async (_label, fields) => {
    signableContracts.mockResolvedValue([marked]);
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signedName", "Jane Doe");
    form.set("agreed", "on");
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=missing&file=${FILE}`);
    expect(recordSignature).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("never takes the marks from the form: a forged marks field changes nothing", async () => {
    // The file has no numbered sections. A form claiming it does must not make initials required.
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signatureMethod", "typed");
    form.set("signedName", "Jane Doe");
    form.set("signMarks", JSON.stringify(MARKS));
    form.set("agreed", "on");
    await expect(signContractFormAction(form)).rejects.toThrow("signed=1");
    await runAfter();
    expect(stampSignature.mock.calls[0][3]).toBeNull();
  });

  it("signs a page opened before this feature deployed: no method field at all is typed, on a file with no marks", async () => {
    // That page posts only the name and the agree box. A missing field must reach parseAdoption as
    // null (typed), not "" (an unknown method, refused).
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signedName", "Jane Doe");
    form.set("agreed", "on");
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=1&file=${FILE}`);
    expect(recordSignature).toHaveBeenCalledWith(expect.objectContaining({ adoption: { method: "typed", initials: null } }));
  });
});
