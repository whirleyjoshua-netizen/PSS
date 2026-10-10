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
const { sendApproved, pollReplies, htmlToText, ITEM_PROPERTY_ID, MAX_INBOX_PAGES } = await import("@/lib/agents/mail");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const accepted = () => new Response(null, { status: 202 });
const MB = "users/support%40premiershadesolutions.com";
const NOW = new Date("2026-10-09T18:00:00.000Z");
const PROPERTY = "String {4d8496b0-6227-4862-9069-ff268a2f1b50} Name PssAgentItemId";
// Written out by hand (not with the code's helper), so a wrong filter or wrong encoding fails here.
const lookupPath = (itemId: string) =>
  `${MB}/messages?$filter=singleValueExtendedProperties%2FAny(ep%3A%20ep%2Fid%20eq%20'String%20%7B4d8496b0-6227-4862-9069-ff268a2f1b50%7D%20Name%20PssAgentItemId'`
  + `%20and%20ep%2Fvalue%20eq%20'${itemId}')&$select=id,conversationId,sentDateTime,isDraft&$top=5`;
const found = (id = "m1", conversationId = "c1", isDraft = false) => json(200, { value: [{ id, conversationId, sentDateTime: "2026-10-09T17:59:00Z", isDraft }] });
const none = () => json(200, { value: [] });
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

it("the item property id is the fixed GUID, and the lookup path is exactly encoded", () => {
  expect(ITEM_PROPERTY_ID).toBe(PROPERTY);
  expect(decodeURIComponent(lookupPath("i1").split("$filter=")[1].split("&")[0]))
    .toBe(`singleValueExtendedProperties/Any(ep: ep/id eq '${PROPERTY}' and ep/value eq 'i1')`);
});

describe("sendApproved", () => {
  it("sends with one sendMail (Mail.Send only) tagged with the item property, then records the copy's ids", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(found());
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
          singleValueExtendedProperties: [{ id: PROPERTY, value: "i1" }],
        },
        saveToSentItems: true,
      },
    });
    expect(graphFetch.mock.calls[1]).toEqual([lookupPath("i1")]);
    expect(store.setSendingBody).toHaveBeenCalledWith("i1", "Hi Pat\n\n--\nPSS");
    expect(store.setSendingBody.mock.invocationCallOrder[0]).toBeLessThan(graphFetch.mock.invocationCallOrder[0]);
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: "Hi Pat\n\n--\nPSS", graphMessageId: "m1", conversationId: "c1", internetMessageId: null });
    expect(store.markFailed).not.toHaveBeenCalled();
  });
  it("accepted but the copy isn't there yet: still sent, with the ids left for the reply poll", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(none());
    expect(await sendApproved(item, "b")).toEqual({ ok: true });
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: "b", graphMessageId: null, conversationId: null, internetMessageId: null });
  });
  it("accepted but the mailbox can't be searched: still sent", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(json(403, {}));
    expect(await sendApproved(item, "b")).toEqual({ ok: true });
    expect(store.markSent).toHaveBeenCalledWith("i1", expect.objectContaining({ conversationId: null }));
    expect(store.markFailed).not.toHaveBeenCalled();
  });
  it("a definite refusal (403, 400, 413) is failed, and a 403 names Mail.Send", async () => {
    for (const status of [403, 400, 413]) {
      graphFetch.mockReset().mockResolvedValueOnce(json(status, {}));
      store.markFailed.mockReset();
      const result = await sendApproved(item, "b");
      expect(result).toMatchObject({ ok: false });
      expect(store.markFailed).toHaveBeenCalledWith("i1", expect.stringContaining("so nothing was sent"));
      expect(graphFetch).toHaveBeenCalledTimes(1);
    }
    graphFetch.mockReset().mockResolvedValueOnce(json(403, {}));
    expect(await sendApproved(item, "b")).toEqual({ ok: false, error: expect.stringContaining("needs the Mail.Send permission") });
    expect(store.markSent).not.toHaveBeenCalled();
  });
  it("a timeout, a 5xx or a 429 is unknown: the row stays approved for the 15-minute check, nothing else is asked", async () => {
    for (const outcome of [() => graphFetch.mockRejectedValueOnce(timeout()), () => graphFetch.mockResolvedValueOnce(json(503, {})),
      () => graphFetch.mockResolvedValueOnce(json(500, {})), () => graphFetch.mockResolvedValueOnce(json(429, {}))]) {
      graphFetch.mockReset();
      outcome();
      const result = await sendApproved(item, "b");
      expect(result).toEqual({ ok: false, error: expect.stringContaining("may have been sent") });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("15 minutes") });
      expect(graphFetch).toHaveBeenCalledTimes(1);
      expect(sendMailCalls()).toHaveLength(1);
      expect(store.markFailed).not.toHaveBeenCalled();
      expect(store.markSent).not.toHaveBeenCalled();
    }
  });
  it("a retry finds the earlier attempt and sends nothing", async () => {
    graphFetch.mockResolvedValueOnce(found());
    expect(await sendApproved(item, "b", true)).toEqual({ ok: true, alreadySent: true });
    expect(graphFetch.mock.calls[0]).toEqual([lookupPath("i1")]);
    expect(sendMailCalls()).toHaveLength(0);
    expect(store.setSendingBody).not.toHaveBeenCalled();
    // The body written by the earlier attempt is kept: null means "leave sent_body as it is".
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: null, graphMessageId: "m1", conversationId: "c1", internetMessageId: null });
  });
  it("a retry ignores a draft copy and sends once", async () => {
    graphFetch.mockResolvedValueOnce(found("d1", "c0", true)).mockResolvedValueOnce(accepted()).mockResolvedValueOnce(found());
    expect(await sendApproved(item, "b", true)).toEqual({ ok: true });
    expect(sendMailCalls()).toHaveLength(1);
    expect(store.markSent).toHaveBeenCalledWith("i1", expect.objectContaining({ sentBody: "b", conversationId: "c1" }));
  });
  it("a retry that can't search the mailbox sends nothing and names Mail.Read", async () => {
    graphFetch.mockResolvedValueOnce(json(403, {}));
    expect(await sendApproved(item, "b", true)).toEqual({ ok: false, error: expect.stringContaining("needs the Mail.Read permission") });
    expect(sendMailCalls()).toHaveLength(0);
  });
  it("a first send never looks for an earlier attempt", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(found());
    await sendApproved(item, "b", false);
    expect(graphFetch.mock.calls[0][0]).toBe(`${MB}/sendMail`);
  });
  it("a database error after a successful send never marks it failed", async () => {
    graphFetch.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(found());
    store.markSent.mockRejectedValueOnce(new Error("neon blip"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendApproved(item, "b");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("was sent") });
    expect(store.markFailed).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("Agent email sent but not recorded", "i1", expect.any(Error));
    errorLog.mockRestore();
  });
});

describe("settling sends in the reply poll", () => {
  it("asks for at most 10 rows of each kind, stuck ones only 15 minutes after the claim", async () => {
    store.sentConversations.mockResolvedValue([]);
    await pollReplies();
    expect(store.stuckApproved).toHaveBeenCalledWith(15, 10);
    expect(store.sentWithoutIds).toHaveBeenCalledWith(60, 10);
  });
  it("a stuck email is sent if its copy is found, failed if not, and left alone if the search fails", async () => {
    const claimedAt = new Date("2026-10-09T17:40:00Z");
    store.stuckApproved.mockResolvedValue([{ id: "found", claimedAt }, { id: "missing", claimedAt }, { id: "unknown", claimedAt }]);
    store.sentConversations.mockResolvedValue([]);
    graphFetch.mockResolvedValueOnce(found("m3", "c3")).mockResolvedValueOnce(none()).mockResolvedValueOnce(json(500, {}));
    await pollReplies();
    expect(graphFetch.mock.calls.map((c) => c[0])).toEqual([lookupPath("found"), lookupPath("missing"), lookupPath("unknown")]);
    expect(store.markSent).toHaveBeenCalledWith("found", { sentBody: null, graphMessageId: "m3", conversationId: "c3", internetMessageId: null });
    expect(store.markFailed).toHaveBeenCalledTimes(1);
    expect(store.markFailed).toHaveBeenCalledWith("missing", expect.stringContaining("so it wasn't sent"));
    expect(sendMailCalls()).toHaveLength(0);
  });
  it("a stuck email whose only copy is a draft is failed", async () => {
    store.stuckApproved.mockResolvedValue([{ id: "s", claimedAt: new Date("2026-10-09T17:40:00Z") }]);
    store.sentConversations.mockResolvedValue([]);
    graphFetch.mockResolvedValueOnce(found("d", "c", true));
    await pollReplies();
    expect(store.markSent).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith("s", expect.any(String));
  });
  it("fills in the ids of a sent email recorded without them, one lookup each, without widening the inbox window", async () => {
    store.sentWithoutIds.mockResolvedValue([{ id: "i7", sentAt: new Date("2026-09-01T15:00:00Z") }, { id: "i8", sentAt: new Date("2026-09-02T15:00:00Z") }]);
    store.sentConversations.mockResolvedValue([{ id: "i7", conversationId: "c7" }]);
    graphFetch.mockResolvedValueOnce(found("m7", "c7")).mockResolvedValueOnce(none()).mockResolvedValueOnce(json(200, { value: [] }));
    await pollReplies();
    expect(graphFetch.mock.calls.slice(0, 2).map((c) => c[0])).toEqual([lookupPath("i7"), lookupPath("i8")]);
    expect(store.setSentIds).toHaveBeenCalledTimes(1);
    expect(store.setSentIds).toHaveBeenCalledWith("i7", { graphMessageId: "m7", conversationId: "c7", internetMessageId: null });
    // Still the last poll minus 5 minutes, not back to September.
    expect(graphFetch.mock.calls[2]).toEqual([inboxPath("2026-10-09T16:55:00.000Z")]);
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
  it("at the page cap, stops and moves the mark only to the newest message it processed", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    const at = (page: number) => new Date(Date.UTC(2026, 9, 9, 17, 0, page)).toISOString();
    for (let page = 0; page < MAX_INBOX_PAGES; page++) {
      graphFetch.mockResolvedValueOnce(json(200, {
        value: [{ id: `m${page}`, conversationId: "other", receivedDateTime: at(page) }],
        "@odata.nextLink": `https://graph.microsoft.com/v1.0/inbox-${page + 1}`,
      }));
    }
    expect(await pollReplies()).toEqual({ stored: 0 });
    expect(MAX_INBOX_PAGES).toBe(20);
    expect(graphFetch).toHaveBeenCalledTimes(MAX_INBOX_PAGES);
    expect(graphFetch.mock.calls.some((c) => c[0] === `https://graph.microsoft.com/v1.0/inbox-${MAX_INBOX_PAGES}`)).toBe(false);
    expect(store.releaseReplyPoll).toHaveBeenCalledTimes(1);
    expect(store.releaseReplyPoll).toHaveBeenCalledWith("2026-10-09 18:00:00.123456+00", new Date(at(MAX_INBOX_PAGES - 1)));
  });
  it("below the cap, keeps the claim time as the mark", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("a", "x")], "@odata.nextLink": "https://graph.microsoft.com/v1.0/inbox-2" }))
      .mockResolvedValueOnce(json(200, { value: [listed("b", "y")] }));
    await pollReplies();
    expect(store.releaseReplyPoll).not.toHaveBeenCalled();
  });
  it("a message that fails to read is not counted as processed: the window goes back", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [listed("a", "c1")] })).mockResolvedValueOnce(json(500, {}));
    await expect(pollReplies()).rejects.toThrow(/message read failed/);
    expect(store.releaseReplyPoll).toHaveBeenCalledWith("2026-10-09 18:00:00.123456+00", new Date("2026-10-09T17:00:00Z"));
  });
});

it("htmlToText drops tags, scripts and entities", () => {
  expect(htmlToText("<style>p{}</style><p>Hi&nbsp;there &amp; you</p><br><div>Bye</div>")).toBe("Hi there & you\nBye");
});
