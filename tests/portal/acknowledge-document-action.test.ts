import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer, destroyCustomerSession: vi.fn() }));
const acknowledgeableDocuments = vi.fn();
const acknowledgementFor = vi.fn();
const recordAcknowledgement = vi.fn();
vi.mock("@/lib/portal/acknowledge-document", () => ({ acknowledgeableDocuments, acknowledgementFor, recordAcknowledgement }));
const notifyOwnersOfDocumentAcknowledgement = vi.fn();
vi.mock("@/lib/docs/emails", () => ({ notifyOwnersOfDocumentAcknowledgement, sendDocumentEmail: vi.fn() }));
// Anything reaching the database from here is a bug the test should see.
const query = vi.fn(() => { throw new Error("database reached"); });
vi.mock("@/lib/db", () => ({ db: () => query }));
const headerValues: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers(headerValues), cookies: async () => new Map() }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const pending: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void pending.push(fn) }));
const runAfter = async () => { for (const fn of pending.splice(0)) await fn(); };
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { acknowledgeDocumentAction, acknowledgeDocumentFormAction } = await import("@/app/(site)/project/actions");
const { TYPED_NAME_MAX } = await import("@/lib/portal/typed-name");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const FILE = "22222222-2222-4222-8222-222222222222";
const EMAIL = "john@example.com";
const job = { id: MINE, name: "John Ramos", projectNo: 1048, status: "sold" };
const document = { id: "d1", title: "Service agreement — PSS-1048", file: { id: FILE, name: "Service agreement — PSS-1048.pdf", leadId: MINE } };
const AT = new Date("2026-09-28T19:00:00Z");

beforeEach(() => {
  pending.length = 0;
  for (const key of Object.keys(headerValues)) delete headerValues[key];
  for (const fn of [revalidatePath, redirect, query]) fn.mockClear();
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job] });
  acknowledgeableDocuments.mockReset().mockResolvedValue([document]);
  acknowledgementFor.mockReset().mockResolvedValue({ leadId: MINE, fileId: FILE, acknowledgedAt: AT });
  recordAcknowledgement.mockReset().mockResolvedValue("acknowledged");
  notifyOwnersOfDocumentAcknowledgement.mockReset().mockResolvedValue(undefined);
});

describe("acknowledgeDocumentAction", () => {
  it("refuses a job the customer does not own, reading nothing", async () => {
    expect(await acknowledgeDocumentAction(THEIRS, FILE, "John", true)).toBe("not-found");
    expect(acknowledgeableDocuments).not.toHaveBeenCalled();
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });
  it("refuses when the box is not ticked", async () => {
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", false)).toBe("invalid");
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });
  it("re-derives the file from this job's list, never trusting the post", async () => {
    acknowledgeableDocuments.mockResolvedValue([]);
    acknowledgementFor.mockResolvedValue(null);
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("not-found");
    expect(acknowledgeableDocuments).toHaveBeenCalledWith(MINE);
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });
  it("answers a repeat of this job's own acknowledgement with success and does nothing", async () => {
    acknowledgeableDocuments.mockResolvedValue([]);
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("acknowledged");
    expect(recordAcknowledgement).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });
  it("refuses another job's acknowledged file, and a malformed id without a lookup", async () => {
    acknowledgeableDocuments.mockResolvedValue([]);
    acknowledgementFor.mockResolvedValue({ leadId: THEIRS, fileId: FILE, acknowledgedAt: AT });
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("not-found");
    acknowledgementFor.mockClear();
    expect(await acknowledgeDocumentAction(MINE, "not-a-uuid", "John", true)).toBe("not-found");
    expect(acknowledgementFor).not.toHaveBeenCalled();
  });
  it("records with the session's email and request facts, then emails the owners after the response", async () => {
    headerValues["x-forwarded-for"] = "1.2.3.4, 10.0.0.1";
    headerValues["user-agent"] = "UA";
    expect(await acknowledgeDocumentAction(MINE, FILE, "John Ramos", true)).toBe("acknowledged");
    expect(recordAcknowledgement).toHaveBeenCalledWith({ jobId: MINE, document, name: "John Ramos", email: EMAIL, ip: "1.2.3.4", userAgent: "UA" });
    expect(notifyOwnersOfDocumentAcknowledgement).not.toHaveBeenCalled();
    await runAfter();
    expect(notifyOwnersOfDocumentAcknowledgement).toHaveBeenCalledWith(job, document.title, EMAIL, AT);
    expect(revalidatePath).toHaveBeenCalledWith("/project");
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });
  it("a raced repeat answers success and emails nobody", async () => {
    recordAcknowledgement.mockResolvedValue("already-acknowledged");
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("acknowledged");
    expect(pending).toHaveLength(0);
  });
  it("refuses a typed name longer than the cap, reading nothing, and takes one at the cap", async () => {
    expect(await acknowledgeDocumentAction(MINE, FILE, "a".repeat(TYPED_NAME_MAX + 1), true)).toBe("invalid");
    expect(acknowledgeableDocuments).not.toHaveBeenCalled();
    expect(recordAcknowledgement).not.toHaveBeenCalled();
    expect(await acknowledgeDocumentAction(MINE, FILE, ` ${"a".repeat(TYPED_NAME_MAX)} `, true)).toBe("acknowledged");
    expect(recordAcknowledgement).toHaveBeenCalledTimes(1);
  });
  it("still answers acknowledged when the owners' email fails after the response", async () => {
    notifyOwnersOfDocumentAcknowledgement.mockRejectedValue(new Error("resend down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await acknowledgeDocumentAction(MINE, FILE, "John Ramos", true)).toBe("acknowledged");
    await expect(runAfter()).resolves.toBeUndefined();
    expect(notifyOwnersOfDocumentAcknowledgement).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
  it("passes a blank-name refusal through", async () => {
    recordAcknowledgement.mockResolvedValue("invalid");
    expect(await acknowledgeDocumentAction(MINE, FILE, " ", true)).toBe("invalid");
  });
  it("release gate: job A's form never reaches job B", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job, { ...job, id: THEIRS }] });
    acknowledgeableDocuments.mockImplementation(async (jobId: string) => (jobId === MINE ? [] : [document]));
    acknowledgementFor.mockResolvedValue(null);
    expect(await acknowledgeDocumentAction(MINE, FILE, "John", true)).toBe("not-found");
    expect(acknowledgeableDocuments).toHaveBeenCalledTimes(1);
    expect(acknowledgeableDocuments).toHaveBeenCalledWith(MINE);
    expect(recordAcknowledgement).not.toHaveBeenCalled();
  });
});

describe("acknowledgeDocumentFormAction", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.append(k, v);
    return data;
  };
  it("redirects with the outcome and the file", async () => {
    await expect(acknowledgeDocumentFormAction(form({ jobId: MINE, fileId: FILE, acknowledgedName: "John", read: "on" })))
      .rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?docAck=1&file=${FILE}`);
    await expect(acknowledgeDocumentFormAction(form({ jobId: MINE, fileId: FILE, acknowledgedName: "John" })))
      .rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?docAck=missing&file=${FILE}`);
    await expect(acknowledgeDocumentFormAction(form({ jobId: THEIRS, fileId: FILE, acknowledgedName: "John", read: "on" })))
      .rejects.toThrow(`NEXT_REDIRECT /project/${THEIRS}?docAck=no&file=${FILE}`);
  });
});
