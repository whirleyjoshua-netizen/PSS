// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const graphFetch = vi.fn();
vi.mock("@/lib/calendar/graph", () => ({ graphFetch, GraphError: class extends Error {} }));
vi.mock("@/lib/calendar/config", () => ({ calendarConfig: () => ({ mailbox: "support@premiershadesolutions.com" }) }));
const store = {
  markSent: vi.fn(), markFailed: vi.fn(), setSendingBody: vi.fn(), setSentIds: vi.fn(), sentWithoutIds: vi.fn(), stuckApproved: vi.fn(),
  sentConversations: vi.fn(), insertReply: vi.fn(), addSuppression: vi.fn(), claimReplyPoll: vi.fn(), releaseReplyPoll: vi.fn(),
};
vi.mock("@/lib/agents/store", () => store);
const { sendApproved, pollReplies, htmlToText } = await import("@/lib/agents/mail");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const accepted = () => new Response(null, { status: 202 });
const MB = "users/support%40premiershadesolutions.com";
const NOW = new Date("2026-10-09T18:00:00.000Z");
const minutesBefore = (m: number, at = NOW) => new Date(at.getTime() - m * 60_000).toISOString();
const sentItemsPath = (since: string) =>
  `${MB}/mailFolders/sentitems/messages?$filter=${encodeURIComponent(`sentDateTime ge ${since}`)}&$orderby=sentDateTime desc&$top=50` +
  "&$select=id,conversationId,internetMessageId,internetMessageHeaders";
const copy = (itemId: string, id = "m1", conversationId = "c1") =>
  ({ id, conversationId, internetMessageId: `<${id}@x>`, internetMessageHeaders: [{ name: "Received", value: "x" }, { name: "x-pss-agent-item", value: itemId }] });
const sentItems = (value: unknown[], next?: string) => json(200, next ? { value, "@odata.nextLink": next } : { value });
const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
const item = { id: "i1", finalTo: "pat@example.com", finalSubject: "Hello", finalBody: "Hi Pat" } as never;
const sendMailCalls = () => graphFetch.mock.calls.filter(([path]) => String(path).endsWith("/sendMail"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  graphFetch.mockReset();
  for (const fn of Object.values(store)) fn.mockReset();
  store.claimReplyPoll.mockResolvedValue({ claimedAt: "2026-10-09 18:00:00.123456+00", previous: new Date("2026-10-09T17:00:00Z") });
  store.sentWithoutIds.mockResolvedValue([]);
  store.stuckApproved.mockResolvedValue([]);
  store.releaseReplyPoll.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("sendApproved", () => {
  it("sends with one sendMail (Mail.Send only) carrying the item header, then records the Sent Items ids", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(sentItems([copy("other", "m0", "c0"), copy("i1")]));
    expect(await sendApproved(item, "Hi Pat\n\n--\nPSS")).toEqual({ ok: true });
    expect(graphFetch).toHaveBeenCalledTimes(2);
    const [path, init] = graphFetch.mock.calls[0];
    expect(path).toBe(`${MB}/sendMail`);
    expect(init).toEqual({
      method: "POST",
      retry: false,
      body: {
        message: {
          subject: "Hello", body: { contentType: "Text", content: "Hi Pat\n\n--\nPSS" },
          toRecipients: [{ emailAddress: { address: "pat@example.com" } }],
          internetMessageHeaders: [{ name: "X-PSS-Agent-Item", value: "i1" }],
        },
        saveToSentItems: true,
      },
    });
    expect(graphFetch.mock.calls[1]).toEqual([sentItemsPath(minutesBefore(5))]);
    expect(store.setSendingBody).toHaveBeenCalledWith("i1", "Hi Pat\n\n--\nPSS");
    expect(store.setSendingBody.mock.invocationCallOrder[0]).toBeLessThan(graphFetch.mock.invocationCallOrder[0]);
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: "Hi Pat\n\n--\nPSS", graphMessageId: "m1", conversationId: "c1", internetMessageId: "<m1@x>" });
    expect(store.markFailed).not.toHaveBeenCalled();
  });
  it("accepted but not in Sent Items yet: still sent, with the ids left for the reply poll", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(sentItems([]));
    expect(await sendApproved(item, "b")).toEqual({ ok: true });
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: "b", graphMessageId: null, conversationId: null, internetMessageId: null });
    expect(store.markFailed).not.toHaveBeenCalled();
  });
  it("accepted but Sent Items can't be read: still sent", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(json(403, {}));
    expect(await sendApproved(item, "b")).toEqual({ ok: true });
    expect(store.markSent).toHaveBeenCalledWith("i1", expect.objectContaining({ conversationId: null }));
    expect(store.markFailed).not.toHaveBeenCalled();
  });
  it("explains a 403 from sendMail as the missing Mail.Send permission and marks it failed", async () => {
    graphFetch.mockResolvedValueOnce(json(403, {}));
    const result = await sendApproved(item, "b");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("needs the Mail.Send permission") });
    expect(store.markFailed).toHaveBeenCalledWith("i1", expect.stringContaining("Mail.Send"));
    expect(store.markSent).not.toHaveBeenCalled();
    expect(graphFetch).toHaveBeenCalledTimes(1);
  });
  it("a timeout, then found in Sent Items: sent, and sendMail ran once", async () => {
    graphFetch.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(sentItems([copy("i1")]));
    expect(await sendApproved(item, "b")).toEqual({ ok: true });
    expect(sendMailCalls()).toHaveLength(1);
    expect(graphFetch.mock.calls[1]).toEqual([sentItemsPath(minutesBefore(5))]);
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: "b", graphMessageId: "m1", conversationId: "c1", internetMessageId: "<m1@x>" });
    expect(store.markFailed).not.toHaveBeenCalled();
  });
  it("a timeout, then not in Sent Items: failed (retryable), and sendMail ran once", async () => {
    graphFetch.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(sentItems([copy("other")]));
    const result = await sendApproved(item, "b");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("isn't in Sent Items, so it wasn't sent") });
    expect(sendMailCalls()).toHaveLength(1);
    expect(store.markFailed).toHaveBeenCalledWith("i1", expect.stringContaining("isn't in Sent Items"));
    expect(store.markSent).not.toHaveBeenCalled();
  });
  it("a 5xx is unknown, not failed: checked against Sent Items", async () => {
    graphFetch.mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(sentItems([copy("i1")]));
    expect(await sendApproved(item, "b")).toEqual({ ok: true });
    expect(sendMailCalls()).toHaveLength(1);
    expect(store.markFailed).not.toHaveBeenCalled();
  });
  it("a timeout when Sent Items can't be read either: failed, saying it may have been sent", async () => {
    graphFetch.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(json(500, {}));
    expect(await sendApproved(item, "b")).toEqual({ ok: false, error: expect.stringContaining("may have been sent: check Sent Items") });
    expect(store.markSent).not.toHaveBeenCalled();
  });
  it("a retry finds the earlier attempt in Sent Items and sends nothing", async () => {
    const earlier = new Date("2026-10-09T17:30:00Z");
    graphFetch.mockResolvedValueOnce(sentItems([copy("i1")]));
    expect(await sendApproved(item, "b", earlier)).toEqual({ ok: true, alreadySent: true });
    expect(graphFetch.mock.calls[0]).toEqual([sentItemsPath(minutesBefore(5, earlier))]);
    expect(sendMailCalls()).toHaveLength(0);
    expect(store.setSendingBody).not.toHaveBeenCalled();
    // The body written by the earlier attempt is kept: null means "leave sent_body as it is".
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: null, graphMessageId: "m1", conversationId: "c1", internetMessageId: "<m1@x>" });
  });
  it("a retry that isn't in Sent Items sends once", async () => {
    const earlier = new Date("2026-10-09T17:30:00Z");
    graphFetch.mockResolvedValueOnce(sentItems([])).mockResolvedValueOnce(accepted()).mockResolvedValueOnce(sentItems([copy("i1")]));
    expect(await sendApproved(item, "b", earlier)).toEqual({ ok: true });
    expect(sendMailCalls()).toHaveLength(1);
    expect(store.markSent).toHaveBeenCalledWith("i1", expect.objectContaining({ sentBody: "b", conversationId: "c1" }));
  });
  it("a retry that can't read Sent Items sends nothing and names Mail.Read", async () => {
    graphFetch.mockResolvedValueOnce(json(403, {}));
    const result = await sendApproved(item, "b", new Date("2026-10-09T17:30:00Z"));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("needs the Mail.Read permission") });
    expect(sendMailCalls()).toHaveLength(0);
  });
  it("follows Sent Items pages to find the copy", async () => {
    graphFetch.mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(sentItems([copy("other")], "https://graph.microsoft.com/v1.0/next-page"))
      .mockResolvedValueOnce(sentItems([copy("i1", "m9", "c9")]));
    expect(await sendApproved(item, "b")).toEqual({ ok: true });
    expect(graphFetch.mock.calls[2]).toEqual(["https://graph.microsoft.com/v1.0/next-page"]);
    expect(store.markSent).toHaveBeenCalledWith("i1", expect.objectContaining({ graphMessageId: "m9", conversationId: "c9" }));
  });
  it("a database error after a successful send never marks it failed", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(sentItems([copy("i1")]));
    store.markSent.mockRejectedValueOnce(new Error("neon blip"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendApproved(item, "b");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("was sent") });
    expect(store.markFailed).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("Agent email sent but not recorded", "i1", expect.any(Error));
    errorLog.mockRestore();
  });
});

const inboxPath = (since: string) =>
  `${MB}/mailFolders/inbox/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$orderby=receivedDateTime asc&$top=50` +
  "&$select=id,conversationId,receivedDateTime";
const fullPath = (id: string) => `${MB}/messages/${id}?$select=internetMessageId,from,receivedDateTime,subject,uniqueBody,body`;
const listed = (id: string, conversationId: string) => ({ id, conversationId, receivedDateTime: "2026-10-09T17:30:00Z" });
const reply = (over: Record<string, unknown>) => json(200, {
  internetMessageId: "<r1>", from: { emailAddress: { address: "pat@example.com" } }, receivedDateTime: "2026-10-09T17:30:00Z", subject: "Re: Hello", ...over,
});

describe("pollReplies", () => {
  it("makes one inbox listing since the last poll minus 5 minutes, matches it in memory, and reads only the matches", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c'1" }, { id: "i2", conversationId: "c2" }, { id: "i3", conversationId: "c3" }]);
    graphFetch
      .mockResolvedValueOnce(json(200, { value: [listed("a", "someone else's thread"), listed("b", "c'1")] }))
      .mockResolvedValueOnce(reply({ internetMessageId: "<r1>", from: { emailAddress: { address: "Pat@Example.com" } }, body: { contentType: "html", content: "<p>Sounds good</p>" } }));
    store.insertReply.mockResolvedValue(true);
    expect(await pollReplies()).toEqual({ stored: 1 });
    expect(graphFetch.mock.calls).toEqual([[inboxPath("2026-10-09T16:55:00.000Z")], [fullPath("b")]]);
    expect(store.insertReply).toHaveBeenCalledWith(expect.objectContaining({ itemId: "i1", internetMessageId: "<r1>", from: "Pat@Example.com", bodyText: "Sounds good" }));
    expect(store.addSuppression).not.toHaveBeenCalled();
  });
  it("makes no request per conversation", async () => {
    store.sentConversations.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, conversationId: `c${i}` })));
    graphFetch.mockResolvedValueOnce(json(200, { value: [] }));
    await pollReplies();
    expect(graphFetch).toHaveBeenCalledTimes(1);
  });
  it("reads back at most 60 days on the first poll, and skips Graph when no agent email was sent", async () => {
    store.claimReplyPoll.mockResolvedValue({ claimedAt: "t", previous: null });
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [] }));
    await pollReplies();
    expect(graphFetch.mock.calls[0]).toEqual([inboxPath(new Date(NOW.getTime() - 60 * 86_400_000).toISOString())]);
    graphFetch.mockReset();
    store.sentConversations.mockResolvedValue([]);
    expect(await pollReplies()).toEqual({ stored: 0 });
    expect(graphFetch).not.toHaveBeenCalled();
  });
  it("skips support@'s own messages", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("own", "c1")] }))
      .mockResolvedValueOnce(reply({ from: { emailAddress: { address: "support@premiershadesolutions.com" } }, body: { contentType: "text", content: "Hi" } }));
    expect(await pollReplies()).toEqual({ stored: 0 });
    expect(store.insertReply).not.toHaveBeenCalled();
  });
  it("follows inbox pages", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("a", "x")], "@odata.nextLink": "https://graph.microsoft.com/v1.0/inbox-2" }))
      .mockResolvedValueOnce(json(200, { value: [listed("b", "c1")] }))
      .mockResolvedValueOnce(reply({ body: { contentType: "text", content: "Yes" } }));
    store.insertReply.mockResolvedValue(true);
    expect(await pollReplies()).toEqual({ stored: 1 });
    expect(graphFetch.mock.calls[1]).toEqual(["https://graph.microsoft.com/v1.0/inbox-2"]);
  });
  it("hands the window back when the listing fails, so the next poll covers it", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(500, {}));
    await expect(pollReplies()).rejects.toThrow(/inbox listing failed/);
    expect(store.releaseReplyPoll).toHaveBeenCalledWith("2026-10-09 18:00:00.123456+00", new Date("2026-10-09T17:00:00Z"));
  });
  it("adds an opt-out reply's sender to do-not-contact", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("b", "c1")] }))
      .mockResolvedValueOnce(reply({ internetMessageId: "<r2>", body: { contentType: "text", content: "No thanks." } }));
    store.insertReply.mockResolvedValue(true);
    await pollReplies();
    expect(store.addSuppression).toHaveBeenCalledWith("pat@example.com", "Replied: No thanks.", "reply");
  });
  it("reads the reply's own text (uniqueBody), not the quoted original with our opt-out footer", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    // The quoted footer here is reworded by the client (no straight quotes), so only using uniqueBody keeps it out.
    const quoted = "Sounds good\n\nSupport sent earlier:\nIf you'd rather not hear from us, just reply no thanks.";
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("b", "c1")] }))
      .mockResolvedValueOnce(reply({ internetMessageId: "<r3>", uniqueBody: { contentType: "text", content: "Sounds good" }, body: { contentType: "text", content: quoted } }));
    store.insertReply.mockResolvedValue(true);
    expect(await pollReplies()).toEqual({ stored: 1 });
    expect(store.insertReply).toHaveBeenCalledWith(expect.objectContaining({ bodyText: "Sounds good" }));
    expect(store.addSuppression).not.toHaveBeenCalled();
  });
  it("falls back to body when uniqueBody is empty", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("b", "c1")] }))
      .mockResolvedValueOnce(reply({ internetMessageId: "<r4>", uniqueBody: { contentType: "html", content: "  " }, body: { contentType: "text", content: "Call me Tuesday" } }));
    store.insertReply.mockResolvedValue(true);
    await pollReplies();
    expect(store.insertReply).toHaveBeenCalledWith(expect.objectContaining({ bodyText: "Call me Tuesday" }));
  });
  it("caps the stored reply at 50 KB of UTF-8 without splitting a character", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    // "é" is 2 bytes. 1 ASCII byte first makes the 50 KB cut land in the middle of an "é".
    const long = "a" + "é".repeat(30_000);
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("b", "c1")] }))
      .mockResolvedValueOnce(reply({ internetMessageId: "<r5>", body: { contentType: "text", content: long } }));
    store.insertReply.mockResolvedValue(true);
    await pollReplies();
    const { bodyText } = store.insertReply.mock.calls[0][0] as { bodyText: string };
    expect(Buffer.byteLength(bodyText, "utf8")).toBeLessThanOrEqual(50 * 1024);
    expect(Buffer.byteLength(bodyText, "utf8")).toBe(50 * 1024 - 1);
    expect(bodyText).not.toContain("�");
  });
  it("is only ever a read: every Graph request is a GET", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("b", "c1")] })).mockResolvedValueOnce(reply({ body: { contentType: "text", content: "Hi" } }));
    store.insertReply.mockResolvedValue(true);
    await pollReplies();
    for (const call of graphFetch.mock.calls) expect(call[1]?.method ?? "GET").toBe("GET");
  });
  it("does nothing inside the 2-minute window unless forced", async () => {
    store.claimReplyPoll.mockResolvedValue(null);
    expect(await pollReplies()).toEqual({ stored: 0 });
    expect(store.claimReplyPoll).toHaveBeenCalledWith(false);
    expect(store.sentConversations).not.toHaveBeenCalled();
    await pollReplies({ force: true });
    expect(store.claimReplyPoll).toHaveBeenLastCalledWith(true);
  });
  it("fills in the ids of a sent email recorded without them, and reads the inbox back to when it went out", async () => {
    const sentAt = new Date("2026-10-08T15:00:00Z");
    store.sentWithoutIds.mockResolvedValue([{ id: "i7", sentAt }]);
    store.sentConversations.mockResolvedValue([{ id: "i7", conversationId: "c7" }]);
    graphFetch.mockResolvedValueOnce(sentItems([copy("i7", "m7", "c7")])).mockResolvedValueOnce(json(200, { value: [] }));
    await pollReplies();
    expect(graphFetch.mock.calls[0]).toEqual([sentItemsPath(minutesBefore(5, sentAt))]);
    expect(store.setSentIds).toHaveBeenCalledWith("i7", { graphMessageId: "m7", conversationId: "c7", internetMessageId: "<m7@x>" });
    expect(graphFetch.mock.calls[1]).toEqual([inboxPath(minutesBefore(5, sentAt))]);
  });
  it("settles emails stuck in 'approved' from Sent Items: found is sent, missing is failed", async () => {
    const claimedAt = new Date("2026-10-09T17:00:00Z");
    store.stuckApproved.mockResolvedValue([{ id: "found", claimedAt }, { id: "missing", claimedAt }]);
    store.sentConversations.mockResolvedValue([]);
    graphFetch.mockResolvedValueOnce(sentItems([copy("found", "m3", "c3")]));
    await pollReplies();
    expect(store.stuckApproved).toHaveBeenCalledWith(15);
    expect(store.markSent).toHaveBeenCalledWith("found", { sentBody: null, graphMessageId: "m3", conversationId: "c3", internetMessageId: "<m3@x>" });
    expect(store.markFailed).toHaveBeenCalledWith("missing", expect.stringContaining("isn't in Sent Items"));
    expect(sendMailCalls()).toHaveLength(0);
  });
  it("leaves a stuck email alone when Sent Items can't be read", async () => {
    store.stuckApproved.mockResolvedValue([{ id: "s", claimedAt: new Date("2026-10-09T17:00:00Z") }]);
    store.sentConversations.mockResolvedValue([]);
    graphFetch.mockResolvedValueOnce(json(403, {}));
    await pollReplies();
    expect(store.markSent).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });
});

it("htmlToText drops tags, scripts and entities", () => {
  expect(htmlToText("<style>p{}</style><p>Hi&nbsp;there &amp; you</p><br><div>Bye</div>")).toBe("Hi there & you\nBye");
});
