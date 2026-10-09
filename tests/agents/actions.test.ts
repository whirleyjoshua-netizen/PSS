import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = {
  claimForSend: vi.fn(), saveEmailEdits: vi.fn(), decideItem: vi.fn(), getItem: vi.fn(), getAgent: vi.fn(),
  getAgentSettings: vi.fn(), isSuppressed: vi.fn(), sentTodayCount: vi.fn(), markFailed: vi.fn(),
};
vi.mock("@/lib/agents/store", () => store);
const mail = { sendApproved: vi.fn(), pollReplies: vi.fn() };
vi.mock("@/lib/agents/mail", () => mail);
let outlook = true;
vi.mock("@/lib/calendar/config", () => ({ calendarEnabled: () => outlook }));
const { revalidatePath } = await import("next/cache");
const actions = await import("@/app/admin/agents/actions");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const pending = { id: ID, kind: "email", status: "pending", agentSlug: "tobi", emailTo: "pat@example.com", emailSubject: "Hello", emailBody: "Hi", finalTo: null, finalSubject: null, finalBody: null };
const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const edited = form({ to: "pat@example.com", subject: "Hello there", body: "Hi Pat, edited" });

beforeEach(() => {
  outlook = true;
  vi.mocked(revalidatePath).mockReset();
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  for (const fn of [...Object.values(store), ...Object.values(mail)]) fn.mockReset();
  store.getItem.mockResolvedValue(pending);
  store.getAgent.mockResolvedValue({ slug: "tobi", dailySendCap: 10 });
  store.getAgentSettings.mockResolvedValue({ mailingAddress: "PO Box 1, Las Vegas NV 89101", signature: null });
  store.isSuppressed.mockResolvedValue(false);
  store.sentTodayCount.mockResolvedValue(0);
  store.saveEmailEdits.mockResolvedValue(true);
  store.claimForSend.mockImplementation(async () => ({ ...pending, status: "approved", finalTo: "pat@example.com", finalSubject: "Hello there", finalBody: "Hi Pat, edited" }));
  mail.sendApproved.mockResolvedValue({ ok: true });
});

describe("approveAndSend", () => {
  it("checks the admin first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.approveAndSend(ID, {}, edited)).rejects.toThrow("NEXT_REDIRECT");
    expect(mail.sendApproved).not.toHaveBeenCalled();
  });
  it("saves the on-screen text, claims it, and sends exactly that text plus the footer", async () => {
    expect(await actions.approveAndSend(ID, {}, edited)).toEqual({ ok: "Sent." });
    expect(store.saveEmailEdits).toHaveBeenCalledWith(ID, { to: "pat@example.com", subject: "Hello there", body: "Hi Pat, edited" });
    expect(store.claimForSend).toHaveBeenCalledWith(ID, "owner@example.com");
    const sentBody = mail.sendApproved.mock.calls[0][1] as string;
    expect(sentBody.startsWith("Hi Pat, edited\n\n--\nPremier Shade Solutions")).toBe(true);
    expect(sentBody).toContain("PO Box 1, Las Vegas NV 89101");
    expect(sentBody.endsWith(`If you'd rather not hear from us, just reply "no thanks".`)).toBe(true);
  });
  it("refuses without a mailing address, to a suppressed address, over the cap, or without Outlook, and sends nothing", async () => {
    const cases: [string, () => void][] = [
      ["mailing address", () => store.getAgentSettings.mockResolvedValue({ mailingAddress: null, signature: null })],
      ["do-not-contact", () => store.isSuppressed.mockResolvedValue(true)],
      ["daily limit", () => store.sentTodayCount.mockResolvedValue(10)],
      ["Outlook", () => { outlook = false; }],
    ];
    for (const [words, arrange] of cases) {
      arrange();
      expect((await actions.approveAndSend(ID, {}, edited)).error).toContain(words);
      expect(store.claimForSend).not.toHaveBeenCalled();
      expect(store.saveEmailEdits).not.toHaveBeenCalled();
      expect(mail.sendApproved).not.toHaveBeenCalled();
      beforeEachReset();
    }
    function beforeEachReset() {
      outlook = true;
      store.getAgentSettings.mockResolvedValue({ mailingAddress: "PO Box 1, Las Vegas NV 89101", signature: null });
      store.isSuppressed.mockResolvedValue(false); store.sentTodayCount.mockResolvedValue(0);
    }
  });
  it("a second click finds it already claimed and sends nothing", async () => {
    store.claimForSend.mockResolvedValue(null);
    expect((await actions.approveAndSend(ID, {}, edited)).error).toMatch(/already/);
    expect(mail.sendApproved).not.toHaveBeenCalled();
  });
  it("never sends text the approving owner didn't see when another edit lands between save and claim", async () => {
    store.claimForSend.mockResolvedValue({ ...pending, status: "approved", finalTo: "pat@example.com", finalSubject: "Hello there", finalBody: "someone else's edit" });
    expect((await actions.approveAndSend(ID, {}, edited)).error).toContain("changed while you were approving");
    expect(mail.sendApproved).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith(ID, "The email changed while you were approving it. Review it and approve again.");
  });
  it("shows Microsoft's refusal and leaves it retryable", async () => {
    mail.sendApproved.mockResolvedValue({ ok: false, error: "needs the Mail.Send permission" });
    expect((await actions.approveAndSend(ID, {}, edited)).error).toContain("Mail.Send");
  });
  it("passes a sent-but-not-recorded error through unchanged", async () => {
    const error = "The email was sent, but saving that failed. Don't send it again; refresh in a minute.";
    mail.sendApproved.mockResolvedValue({ ok: false, error });
    expect(await actions.approveAndSend(ID, {}, edited)).toEqual({ error });
  });
  it("rejects two recipients typed into To", async () => {
    expect((await actions.approveAndSend(ID, {}, form({ to: "a@b.co, c@d.co", subject: "s", body: "b" }))).error).toBeTruthy();
    expect(store.claimForSend).not.toHaveBeenCalled();
  });
});

describe("malformed ids", () => {
  const BAD = "not-a-uuid";
  it("every id-taking action refuses a malformed id and writes nothing", async () => {
    const calls = [
      () => actions.approveAndSend(BAD, {}, edited),
      () => actions.saveEdits(BAD, {}, edited),
      () => actions.declineItem(BAD, {}, form({ note: "x" })),
      () => actions.decide(BAD, {}, form({ choice: "approved", note: "x" })),
    ];
    for (const call of calls) {
      expect(await call()).toEqual({ error: "That item no longer exists." });
    }
    expect(requireAdmin).toHaveBeenCalledTimes(calls.length);
    for (const fn of [store.saveEmailEdits, store.claimForSend, store.decideItem, store.markFailed, store.getItem, mail.sendApproved]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("saveEdits", () => {
  it("saves the on-screen text", async () => {
    expect(await actions.saveEdits(ID, {}, edited)).toEqual({ ok: "Edits saved." });
    expect(store.saveEmailEdits).toHaveBeenCalledWith(ID, { to: "pat@example.com", subject: "Hello there", body: "Hi Pat, edited" });
  });
});

describe("decisions", () => {
  it("records approve with a note, as the signed-in owner", async () => {
    store.decideItem.mockResolvedValue(true);
    expect(await actions.decide(ID, {}, form({ choice: "approved", note: "go ahead" }))).toEqual({ ok: "Saved." });
    expect(store.decideItem).toHaveBeenCalledWith(ID, { status: "approved", note: "go ahead", by: "owner@example.com" });
  });
  it("refuses an unknown choice", async () => {
    expect((await actions.decide(ID, {}, form({ choice: "maybe" }))).error).toBeTruthy();
  });
  it("declines an email with a note", async () => {
    store.decideItem.mockResolvedValue(true);
    await actions.declineItem(ID, {}, form({ note: "wrong person" }));
    expect(store.decideItem).toHaveBeenCalledWith(ID, { status: "declined", note: "wrong person", by: "owner@example.com" });
  });
});

describe("refreshReplies", () => {
  it("forces a poll and refreshes the pages", async () => {
    mail.pollReplies.mockResolvedValue({ stored: 1 });
    await actions.refreshReplies();
    expect(mail.pollReplies).toHaveBeenCalledWith({ force: true });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/agents");
  });
  it("does not throw when the poll fails, logs it, and still refreshes", async () => {
    const error = new Error("graph down");
    mail.pollReplies.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(actions.refreshReplies()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Agent reply refresh failed", error);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/agents");
    log.mockRestore();
  });
});
