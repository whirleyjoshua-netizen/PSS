import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const store = {
  isProcessed: vi.fn(), recordOutcome: vi.fn(), findJobByProjectNo: vi.fn(), latestSha: vi.fn(),
  importVersion: vi.fn(), getDcSettings: vi.fn(), setLastPolledAt: vi.fn(),
};
vi.mock("@/lib/dc/store", () => store);
const files = { createFile: vi.fn(), deleteFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);
const notify = { notifyOwners: vi.fn().mockResolvedValue(undefined), importEmail: vi.fn(() => ({ subject: "s", text: "t" })) };
vi.mock("@/lib/dc/notify", () => notify);
const mailbox = { listCandidateMessages: vi.fn(), htmlAttachments: vi.fn() };
vi.mock("@/lib/dc/mailbox", () => mailbox);
const { importDealerCopy, pollMailbox } = await import("@/lib/dc/import");

const ONE = readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8");
const JOB_A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "A", projectNo: 1042 };
const input = { internetMessageId: "<m1@x>", receivedAt: new Date("2026-09-27T19:30:00Z"), html: ONE };

beforeEach(() => {
  for (const f of [...Object.values(store), ...Object.values(files), ...Object.values(mailbox)]) f.mockReset();
  store.isProcessed.mockResolvedValue(false);
  store.latestSha.mockResolvedValue(null);
  files.createFile.mockResolvedValue({ id: "f1" });
  store.importVersion.mockResolvedValue({ versionId: "v1", version: 1 });
});

describe("importDealerCopy", () => {
  it("files the copy as an internal dealer_copy and imports against the PSS number's job ONLY", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    const result = await importDealerCopy(input);
    expect(result).toMatchObject({ outcome: "imported", leadId: JOB_A.id, version: 1 });
    expect(store.findJobByProjectNo).toHaveBeenCalledWith(1042);
    expect(files.createFile).toHaveBeenCalledWith(expect.objectContaining({ leadId: JOB_A.id, docType: "dealer_copy", contentType: "text/html" }));
    expect(store.importVersion).toHaveBeenCalledWith(expect.objectContaining({ leadId: JOB_A.id, messageId: "<m1@x>" }));
  });
  it("RELEASE GATE: a number that matches no job imports nothing anywhere", async () => {
    store.findJobByProjectNo.mockResolvedValue(null);
    const result = await importDealerCopy(input);
    expect(result.outcome).toBe("no-match");
    expect(files.createFile).not.toHaveBeenCalled();
    expect(store.importVersion).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-match", leadId: null }));
  });
  it("an identical re-send (e.g. after the email moved folders) is 'unchanged', not v2", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    const { createHash } = await import("node:crypto");
    store.latestSha.mockResolvedValue(createHash("sha256").update(ONE).digest("hex"));
    const result = await importDealerCopy({ ...input, internetMessageId: "<m1-moved@x>" });
    expect(result.outcome).toBe("unchanged");
    expect(files.createFile).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unchanged" }));
  });
  it("an already-processed message does nothing at all", async () => {
    store.isProcessed.mockResolvedValue(true);
    await importDealerCopy(input);
    expect(store.findJobByProjectNo).not.toHaveBeenCalled();
    expect(store.recordOutcome).not.toHaveBeenCalled();
  });
  it("a parse refusal is recorded with its outcome and nothing is filed", async () => {
    const result = await importDealerCopy({ ...input, html: ONE.replace("DEALER COSTS", "") });
    expect(result.outcome).toBe("no-costs");
    expect(files.createFile).not.toHaveBeenCalled();
  });
  it("if the import statement inserts nothing (a race), the stored copy is removed", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    store.importVersion.mockResolvedValue(null);
    await importDealerCopy(input);
    expect(files.deleteFile).toHaveBeenCalledWith("f1", "Direct Connect");
  });
});

describe("pollMailbox", () => {
  const message = { id: "g1", internetMessageId: "<z@x>", subject: "DEALER COPY #1, PO PSS-1042", from: "retailer@hunterdouglas.com", receivedAt: new Date() };

  it("reads from an hour before the last poll, and advances the mark only after a clean run", async () => {
    const last = new Date("2026-09-27T19:00:00Z");
    store.getDcSettings.mockResolvedValue({ lastPolledAt: last });
    mailbox.listCandidateMessages.mockResolvedValue([]);
    const now = new Date("2026-09-27T19:15:00Z");
    await pollMailbox(now);
    expect(mailbox.listCandidateMessages).toHaveBeenCalledWith(new Date("2026-09-27T18:00:00Z"));
    expect(store.setLastPolledAt).toHaveBeenCalledWith(now);
  });
  it("a message with no single .html attachment is recorded unreadable", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([message]);
    mailbox.htmlAttachments.mockResolvedValue([]);
    const { results } = await pollMailbox(new Date());
    expect(results).toEqual([{ messageId: "<z@x>", outcome: "unreadable" }]);
  });
  it("skips a message already processed without fetching its attachments", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([message]);
    store.isProcessed.mockResolvedValue(true);
    const { seen, results } = await pollMailbox(new Date());
    expect(seen).toBe(1);
    expect(results).toEqual([]);
    expect(mailbox.htmlAttachments).not.toHaveBeenCalled();
    expect(store.recordOutcome).not.toHaveBeenCalled();
  });
  it("a failing message is reported failed, not recorded, and holds the mark back", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([message]);
    mailbox.htmlAttachments.mockRejectedValue(new Error("Graph GET failed (503)"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { results } = await pollMailbox(new Date());
    spy.mockRestore();
    expect(results).toEqual([{ messageId: "<z@x>", outcome: "failed" }]);
    expect(store.recordOutcome).not.toHaveBeenCalled();
    expect(store.setLastPolledAt).not.toHaveBeenCalled();
  });
  it("looks back a week on the very first run", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([]);
    await pollMailbox(new Date("2026-09-27T19:00:00Z"));
    expect(mailbox.listCandidateMessages).toHaveBeenCalledWith(new Date("2026-09-20T18:00:00Z"));
  });
});
