import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const store = {
  isProcessed: vi.fn(), recordOutcome: vi.fn(), findJobByProjectNo: vi.fn(), latestSha: vi.fn(), quoteOptionExists: vi.fn(),
  importVersion: vi.fn(), getDcSettings: vi.fn(), setLastPolledAt: vi.fn(),
};
vi.mock("@/lib/dc/store", () => store);
const files = { createFile: vi.fn(), deleteFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);
const notify = {
  notifyOwners: vi.fn().mockResolvedValue(undefined), importEmail: vi.fn(() => ({ subject: "s", text: "t" })),
  staleFailuresEmail: vi.fn(() => ({ subject: "stale", text: "t" })),
};
vi.mock("@/lib/dc/notify", () => notify);
const mailbox = { listCandidateMessages: vi.fn(), htmlAttachments: vi.fn() };
vi.mock("@/lib/dc/mailbox", () => mailbox);
const { importDealerCopy, pollMailbox } = await import("@/lib/dc/import");

const ONE = readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8");
/** The Client: cell's value in the fixture, with the label cell captured as $1. */
const CLIENT_CELL = /(<b>Client:<\/b><\/td><td>)Test</;
const JOB_A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "A", projectNo: 1042 };
const input = { internetMessageId: "<m1@x>", receivedAt: new Date("2026-09-27T19:30:00Z"), html: ONE };

beforeEach(() => {
  for (const f of [...Object.values(store), ...Object.values(files), ...Object.values(mailbox)]) f.mockReset();
  store.isProcessed.mockResolvedValue(false);
  store.latestSha.mockResolvedValue(null);
  store.quoteOptionExists.mockResolvedValue(true);
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
  /** The hash an import of `html` stores, read from what importDealerCopy passed to importVersion. */
  const storedSha = async (html: string): Promise<string> => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    await importDealerCopy({ ...input, internetMessageId: "<first@x>", html });
    const sha = store.importVersion.mock.calls.at(-1)![0].sha256 as string;
    for (const f of [...Object.values(store), ...Object.values(files)]) f.mockClear();
    notify.importEmail.mockClear();
    notify.notifyOwners.mockClear();
    return sha;
  };

  it("an identical re-send (e.g. after the email moved folders) is 'unchanged', not v2", async () => {
    store.latestSha.mockResolvedValue(await storedSha(ONE));
    const result = await importDealerCopy({ ...input, internetMessageId: "<m1-moved@x>" });
    expect(result.outcome).toBe("unchanged");
    expect(files.createFile).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unchanged" }));
  });
  it("a re-send whose only difference is DC's per-email tracking pixel is 'unchanged': no version, no email", async () => {
    const pixel = /awstrack\.me\/I0\/[^"']+/;
    expect(ONE).toMatch(pixel);
    const resent = ONE.replace(pixel, "awstrack.me/I0/010001a0ffffffff-00000000-0000-0000-0000-000000000000-000000/other=473");
    expect(resent).not.toBe(ONE);
    store.latestSha.mockResolvedValue(await storedSha(ONE));
    const result = await importDealerCopy({ ...input, internetMessageId: "<m1-resent@x>", html: resent });
    expect(result.outcome).toBe("unchanged");
    expect(files.createFile).not.toHaveBeenCalled();
    expect(store.importVersion).not.toHaveBeenCalled();
    expect(notify.notifyOwners).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unchanged", dcQuoteNo: "22250749" }));
  });
  it("a copy whose quote content changed is a new version (the hash is of the quote, not a constant)", async () => {
    store.latestSha.mockResolvedValue(await storedSha(ONE));
    const changed = ONE.replace(CLIENT_CELL, "$1Test Two<");
    expect(changed).not.toBe(ONE);
    const result = await importDealerCopy({ ...input, internetMessageId: "<m2@x>", html: changed });
    expect(result.outcome).toBe("imported");
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
  it("a parse refusal keeps the quote number it read: recorded, and named in the owners' email", async () => {
    notify.importEmail.mockClear();
    await importDealerCopy({ ...input, html: ONE.replace("DEALER COSTS", "") });
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-costs", dcQuoteNo: "22250749" }));
    expect(notify.importEmail).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-costs", dcQuoteNo: "22250749" }));
  });
  it("RELEASE GATE: a PO that names the job's number in another spelling (PSS-01042) is no-match", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    const html = ONE.replace("<td>PSS-1042</td>", "<td>PSS-01042</td>");
    expect(html).not.toBe(ONE);
    const result = await importDealerCopy({ ...input, html });
    expect(result).toMatchObject({ outcome: "no-match", leadId: null, detail: "PSS-01042" });
    expect(files.createFile).not.toHaveBeenCalled();
    expect(store.importVersion).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-match", leadId: null }));
  });
  it("if the import statement inserts nothing (a race), the stored copy is removed", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    store.importVersion.mockResolvedValue(null);
    await importDealerCopy(input);
    expect(files.deleteFile).toHaveBeenCalledWith("f1", "Direct Connect");
  });
  it("if the import statement throws, the stored copy is removed and the error still propagates", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    store.importVersion.mockRejectedValue(new Error("db down"));
    files.deleteFile.mockRejectedValue(new Error("cleanup failed too"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(importDealerCopy(input)).rejects.toThrow("db down");
    expect(files.deleteFile).toHaveBeenCalledWith("f1", "Direct Connect");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("an owner email that fails does not undo or fail the import", async () => {
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    notify.notifyOwners.mockRejectedValueOnce(new Error("Resend down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await importDealerCopy(input);
    expect(result).toMatchObject({ outcome: "imported", version: 1 });
    expect(spy).toHaveBeenCalledWith("DC import email failed", expect.any(Error));
    spy.mockRestore();
  });
  it("an unchanged re-send emails nobody", async () => {
    store.latestSha.mockResolvedValue(await storedSha(ONE));
    await importDealerCopy(input);
    expect(notify.importEmail).not.toHaveBeenCalled();
    expect(notify.notifyOwners).not.toHaveBeenCalled();
  });

  describe("quote options (spec §4)", () => {
    const B_COPY = ONE.replace("<td>PSS-1042</td>", "<td>PSS-1042-B</td>");
    // notify's mocks are not reset per test: clear the email mock so an earlier test's call cannot satisfy these.
    beforeEach(() => notify.importEmail.mockClear());

    it("imports PSS-1042-B onto job 1042's option B once the option was added, compared and named as B", async () => {
      expect(B_COPY).not.toBe(ONE);
      store.findJobByProjectNo.mockResolvedValue(JOB_A);
      const result = await importDealerCopy({ ...input, html: B_COPY });
      expect(result).toMatchObject({ outcome: "imported", leadId: JOB_A.id });
      expect(store.quoteOptionExists).toHaveBeenCalledWith(JOB_A.id, "B");
      expect(store.latestSha).toHaveBeenCalledWith(JOB_A.id, "B");
      expect(store.importVersion).toHaveBeenCalledWith(expect.objectContaining({ quote: expect.objectContaining({ option: "B", poReference: "PSS-1042-B" }) }));
      expect(notify.importEmail).toHaveBeenCalledWith(expect.objectContaining({ outcome: "imported", projectNo: "PSS-1042-B" }));
    });

    it("RELEASE GATE: PSS-1042-B on a job with no option B is no-match, and nothing is filed", async () => {
      store.findJobByProjectNo.mockResolvedValue(JOB_A);
      store.quoteOptionExists.mockResolvedValue(false);
      const result = await importDealerCopy({ ...input, html: B_COPY });
      expect(result).toMatchObject({ outcome: "no-match", leadId: null, detail: "PSS-1042-B" });
      expect(files.createFile).not.toHaveBeenCalled();
      expect(store.importVersion).not.toHaveBeenCalled();
      expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-match", leadId: null, detail: "PSS-1042-B" }));
    });

    it("an option A copy is compared with option A's newest version and emailed under the job's own number", async () => {
      store.findJobByProjectNo.mockResolvedValue(JOB_A);
      await importDealerCopy(input);
      expect(store.latestSha).toHaveBeenCalledWith(JOB_A.id, "A");
      expect(notify.importEmail).toHaveBeenCalledWith(expect.objectContaining({ outcome: "imported", projectNo: "PSS-1042" }));
    });
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
  it("a real copy plus an oversized .html is unreadable, not imported", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([message]);
    mailbox.htmlAttachments.mockResolvedValue([{ name: "DEALER COPY 1.html", bytes: Buffer.from(ONE) }, { name: "big.html", bytes: null }]);
    const { results } = await pollMailbox(new Date());
    expect(results).toEqual([{ messageId: "<z@x>", outcome: "unreadable" }]);
    expect(store.findJobByProjectNo).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unreadable", detail: "2 HTML attachments" }));
  });
  it("a single oversized .html is unreadable", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([message]);
    mailbox.htmlAttachments.mockResolvedValue([{ name: "big.html", bytes: null }]);
    const { results } = await pollMailbox(new Date());
    expect(results).toEqual([{ messageId: "<z@x>", outcome: "unreadable" }]);
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unreadable", detail: "HTML attachment over 1 MB or empty" }));
  });
  it("a single normal .html attachment is imported", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([message]);
    mailbox.htmlAttachments.mockResolvedValue([{ name: "DEALER COPY 1.html", bytes: Buffer.from(ONE) }]);
    store.findJobByProjectNo.mockResolvedValue(JOB_A);
    const { results } = await pollMailbox(new Date());
    expect(results).toEqual([{ messageId: "<z@x>", outcome: "imported" }]);
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
  it("looks back only an hour (plus the overlap) on the very first run", async () => {
    store.getDcSettings.mockResolvedValue({ lastPolledAt: null });
    mailbox.listCandidateMessages.mockResolvedValue([]);
    await pollMailbox(new Date("2026-09-27T19:00:00Z"));
    expect(mailbox.listCandidateMessages).toHaveBeenCalledWith(new Date("2026-09-27T17:00:00Z"));
  });

  describe("a message that keeps failing", () => {
    const NOW = new Date("2026-09-28T12:00:00Z");
    const old = (n: number, hoursAgo: number) => ({
      ...message, id: `g${n}`, internetMessageId: `<old${n}@x>`, subject: `DEALER COPY #2225074${n}, PO PSS-1042`,
      receivedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
    });
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      store.getDcSettings.mockResolvedValue({ lastPolledAt: new Date("2026-09-28T11:45:00Z") });
      mailbox.htmlAttachments.mockRejectedValue(new Error("Graph GET failed (503)"));
      notify.notifyOwners.mockReset().mockResolvedValue(undefined);
      notify.staleFailuresEmail.mockClear();
      spy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => spy.mockRestore());

    it("emails the owners once per run, naming each quote failing for over 24 hours, and still does not record it", async () => {
      mailbox.listCandidateMessages.mockResolvedValue([old(1, 25), old(2, 30), old(3, 2)]);
      const { results } = await pollMailbox(NOW);
      expect(results.map((r) => r.outcome)).toEqual(["failed", "failed", "failed"]);
      expect(notify.staleFailuresEmail).toHaveBeenCalledOnce();
      expect(notify.staleFailuresEmail).toHaveBeenCalledWith([
        { quoteNo: "22250741", receivedAt: old(1, 25).receivedAt },
        { quoteNo: "22250742", receivedAt: old(2, 30).receivedAt },
      ]);
      expect(notify.notifyOwners).toHaveBeenCalledOnce();
      expect(notify.notifyOwners).toHaveBeenCalledWith({ subject: "stale", text: "t" });
      expect(store.recordOutcome).not.toHaveBeenCalled();
      expect(store.setLastPolledAt).not.toHaveBeenCalled();
    });
    it("says nothing about a failure younger than 24 hours: the next run retries it", async () => {
      mailbox.listCandidateMessages.mockResolvedValue([old(3, 23)]);
      await pollMailbox(NOW);
      expect(notify.notifyOwners).not.toHaveBeenCalled();
    });
    it("a failed warning email is logged, not thrown", async () => {
      mailbox.listCandidateMessages.mockResolvedValue([old(1, 25)]);
      notify.notifyOwners.mockRejectedValueOnce(new Error("Resend down"));
      await expect(pollMailbox(NOW)).resolves.toMatchObject({ results: [{ outcome: "failed" }] });
      expect(spy).toHaveBeenCalledWith("DC import failure warning email failed", expect.any(Error));
    });
  });
});
