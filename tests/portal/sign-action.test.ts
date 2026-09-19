import { beforeEach, describe, expect, it, vi } from "vitest";

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

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const MISSING = "00000000-0000-4000-8000-000000000000";
const FILE = "22222222-2222-4222-8222-222222222222";
const EMAIL = "john@example.com";
const SIGNED_AT = new Date("2026-09-18T17:00:00Z");

const job = { id: MINE, name: "John Ramos", projectNo: 1048, status: "sold" };
const contract = { id: FILE, name: "Contract - Living room.pdf", docType: "contract", leadId: MINE };
const signature = {
  signedName: "Jane Doe", signedEmail: EMAIL, signedAt: SIGNED_AT, docSha256: "abc", fileId: FILE,
};
const STAMPED = Buffer.from("stamped");

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
    expect(await signContractAction(THEIRS, FILE, "Jane Doe", true)).toBe("not-found");
    expect(recordSignature).not.toHaveBeenCalled();
    expect(signableContracts).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("answers a job that does not exist the same way", async () => {
    const missing = await signContractAction(MISSING, FILE, "Jane Doe", true);
    const theirs = await signContractAction(THEIRS, FILE, "Jane Doe", true);
    expect(missing).toBe("not-found");
    expect(theirs).toBe(missing);
    expect(signableContracts).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a signable contract on this job", async () => {
    signableContracts.mockResolvedValue([]);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true)).toBe("not-found");
    expect(signableContracts).toHaveBeenCalledWith(MINE);
    expect(recordSignature).not.toHaveBeenCalled();
  });

  it("refuses a posted id that is not in the list, even when the list is not empty", async () => {
    expect(await signContractAction(MINE, "a-quote-id", "Jane Doe", true)).toBe("not-found");
    expect(recordSignature).not.toHaveBeenCalled();
  });

  it("refuses when the box is not ticked", async () => {
    expect(await signContractAction(MINE, FILE, "Jane Doe", false)).toBe("invalid");
    expect(recordSignature).not.toHaveBeenCalled();
  });
});

describe("signContractAction recording", () => {
  it("records the session's email and the listed file, never anything from the form", async () => {
    headerValues["x-forwarded-for"] = "203.0.113.9, 10.0.0.1";
    headerValues["user-agent"] = "TestBrowser/1";
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signedName", "Jane Doe");
    form.set("agreed", "on");
    form.set("email", "attacker@example.com");
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=1`);
    expect(recordSignature).toHaveBeenCalledWith({
      jobId: MINE, file: contract, name: "Jane Doe", email: EMAIL, ip: "203.0.113.9", userAgent: "TestBrowser/1",
    });
  });

  it("redirects with a refusal when the form arrives without the box ticked", async () => {
    const form = new FormData();
    form.set("jobId", MINE);
    form.set("fileId", FILE);
    form.set("signedName", "Jane Doe");
    await expect(signContractFormAction(form)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?signed=no`);
    expect(recordSignature).not.toHaveBeenCalled();
  });

  it("passes a refusal from recordSignature straight back and runs nothing after it", async () => {
    recordSignature.mockResolvedValue("invalid");
    expect(await signContractAction(MINE, FILE, "   ", true)).toBe("invalid");
    expect(pending).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("stamps, stores and emails the copy after answering", async () => {
    expect(await signContractAction(MINE, FILE, "Jane Doe", true)).toBe("signed");
    // Nothing slow has run yet: the answer does not wait on it.
    expect(stampSignature).not.toHaveBeenCalled();
    await runAfter();
    expect(stampSignature).toHaveBeenCalledWith(Buffer.from("pdf bytes"), {
      signedName: "Jane Doe", signedEmail: EMAIL, signedAt: SIGNED_AT, sha256: "abc", projectNo: "PSS-1048",
    });
    expect(storeSignedCopy).toHaveBeenCalledWith({ jobId: MINE, original: contract, bytes: STAMPED, actor: EMAIL });
    expect(notifyOwnersOfSignature).toHaveBeenCalledWith(job, contract.name, EMAIL, true);
    expect(sendCustomerSignedCopy).toHaveBeenCalledWith(EMAIL, job, contract.name, STAMPED);
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });

  it("still succeeds when stamping fails, and tells the owners so", async () => {
    stampSignature.mockResolvedValue(null);
    expect(await signContractAction(MINE, FILE, "Jane Doe", true)).toBe("signed");
    await runAfter();
    expect(storeSignedCopy).not.toHaveBeenCalled();
    expect(notifyOwnersOfSignature).toHaveBeenCalledWith(job, contract.name, EMAIL, false);
    expect(sendCustomerSignedCopy).toHaveBeenCalledWith(EMAIL, job, contract.name, null);
  });

  it("keeps the signature when the copy cannot be saved and both emails fail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    storeSignedCopy.mockRejectedValue(new Error("blob down"));
    notifyOwnersOfSignature.mockRejectedValue(new Error("resend down"));
    sendCustomerSignedCopy.mockRejectedValue(new Error("resend down"));
    expect(await signContractAction(MINE, FILE, "Jane Doe", true)).toBe("signed");
    await expect(runAfter()).resolves.toBeUndefined();
    // The owners still hear about it, told the stamped copy is missing.
    expect(notifyOwnersOfSignature).toHaveBeenCalledWith(job, contract.name, EMAIL, false);
    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });
});
