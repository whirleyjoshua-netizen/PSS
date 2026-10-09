// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const graphFetch = vi.fn();
vi.mock("@/lib/calendar/graph", () => ({ graphFetch, GraphError: class extends Error {} }));
vi.mock("@/lib/calendar/config", () => ({ calendarConfig: () => ({ mailbox: "support@premiershadesolutions.com" }) }));
const store = {
  markSent: vi.fn(), markFailed: vi.fn(), sentConversations: vi.fn(), insertReply: vi.fn(), addSuppression: vi.fn(), claimReplyPoll: vi.fn(),
};
vi.mock("@/lib/agents/store", () => store);
const { sendApproved, pollReplies, htmlToText } = await import("@/lib/agents/mail");
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const item = { id: "i1", finalTo: "pat@example.com", finalSubject: "Hello", finalBody: "Hi Pat" } as never;

beforeEach(() => {
  graphFetch.mockReset();
  for (const fn of Object.values(store)) fn.mockReset();
  store.claimReplyPoll.mockResolvedValue(true);
});

describe("sendApproved", () => {
  it("creates a draft with exactly the approved text, sends it, and records the ids", async () => {
    graphFetch
      .mockResolvedValueOnce(json(201, { id: "m1", conversationId: "c1", internetMessageId: "<x@y>" }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    expect(await sendApproved(item, "Hi Pat\n\n--\nPSS")).toEqual({ ok: true });
    const [path, init] = graphFetch.mock.calls[0];
    expect(path).toBe("users/support%40premiershadesolutions.com/messages");
    expect(init.body).toEqual({
      subject: "Hello", body: { contentType: "Text", content: "Hi Pat\n\n--\nPSS" },
      toRecipients: [{ emailAddress: { address: "pat@example.com" } }],
    });
    expect(graphFetch.mock.calls[1][0]).toBe("users/support%40premiershadesolutions.com/messages/m1/send");
    expect(store.markSent).toHaveBeenCalledWith("i1", { sentBody: "Hi Pat\n\n--\nPSS", graphMessageId: "m1", conversationId: "c1", internetMessageId: "<x@y>" });
  });
  it("explains a 403 as the missing Mail.Send permission and marks it failed", async () => {
    graphFetch.mockResolvedValueOnce(json(403, {}));
    const result = await sendApproved(item, "b");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Mail.Send") });
    expect(store.markFailed).toHaveBeenCalledWith("i1", expect.stringContaining("Mail.Send"));
    expect(store.markSent).not.toHaveBeenCalled();
  });
  it("marks failed when the send step fails after the draft", async () => {
    graphFetch.mockResolvedValueOnce(json(201, { id: "m1", conversationId: "c1", internetMessageId: "<x>" })).mockResolvedValueOnce(json(500, {}));
    expect(await sendApproved(item, "b")).toMatchObject({ ok: false });
    expect(store.markFailed).toHaveBeenCalled();
  });
  it("a database error after a successful send never marks it failed", async () => {
    graphFetch
      .mockResolvedValueOnce(json(201, { id: "m1", conversationId: "c1", internetMessageId: "<x>" }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    store.markSent.mockRejectedValueOnce(new Error("neon blip"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendApproved(item, "b");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("was sent") });
    expect(store.markFailed).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("Agent email sent but not recorded", "i1", expect.any(Error));
    errorLog.mockRestore();
  });
});

describe("pollReplies", () => {
  it("asks Graph only about stored conversations and stores replies from others", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c'1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [
      { internetMessageId: "<own>", from: { emailAddress: { address: "support@premiershadesolutions.com" } }, receivedDateTime: "2026-10-09T16:00:00Z", subject: "Hello", body: { contentType: "text", content: "Hi Pat" } },
      { internetMessageId: "<r1>", from: { emailAddress: { address: "Pat@Example.com" } }, receivedDateTime: "2026-10-09T17:00:00Z", subject: "Re: Hello", body: { contentType: "html", content: "<p>Sounds good</p>" } },
    ] }));
    store.insertReply.mockResolvedValue(true);
    expect(await pollReplies()).toEqual({ stored: 1 });
    const path = graphFetch.mock.calls[0][0] as string;
    expect(path).toContain("$filter=" + encodeURIComponent("conversationId eq 'c''1'"));
    expect(path).toContain("$select=internetMessageId,from,receivedDateTime,subject,uniqueBody,body");
    expect(graphFetch.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(store.insertReply).toHaveBeenCalledWith(expect.objectContaining({ itemId: "i1", internetMessageId: "<r1>", from: "Pat@Example.com", bodyText: "Sounds good" }));
    expect(store.addSuppression).not.toHaveBeenCalled();
  });
  it("adds an opt-out reply's sender to do-not-contact", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [
      { internetMessageId: "<r2>", from: { emailAddress: { address: "pat@example.com" } }, receivedDateTime: "2026-10-09T17:00:00Z", subject: "Re", body: { contentType: "text", content: "No thanks." } },
    ] }));
    store.insertReply.mockResolvedValue(true);
    await pollReplies();
    expect(store.addSuppression).toHaveBeenCalledWith("pat@example.com", "Replied: No thanks.", "reply");
  });
  it("reads the reply's own text (uniqueBody), not the quoted original with our opt-out footer", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    // The quoted footer here is reworded by the client (no straight quotes), so only using uniqueBody keeps it out.
    const quoted = "Sounds good\n\nSupport sent earlier:\nIf you'd rather not hear from us, just reply no thanks.";
    graphFetch.mockResolvedValueOnce(json(200, { value: [
      { internetMessageId: "<r3>", from: { emailAddress: { address: "pat@example.com" } }, receivedDateTime: "2026-10-09T17:00:00Z", subject: "Re: Hello",
        uniqueBody: { contentType: "text", content: "Sounds good" }, body: { contentType: "text", content: quoted } },
    ] }));
    store.insertReply.mockResolvedValue(true);
    expect(await pollReplies()).toEqual({ stored: 1 });
    expect(store.insertReply).toHaveBeenCalledWith(expect.objectContaining({ bodyText: "Sounds good" }));
    expect(store.addSuppression).not.toHaveBeenCalled();
  });
  it("falls back to body when uniqueBody is empty", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    graphFetch.mockResolvedValueOnce(json(200, { value: [
      { internetMessageId: "<r4>", from: { emailAddress: { address: "pat@example.com" } }, receivedDateTime: "2026-10-09T17:00:00Z", subject: "Re",
        uniqueBody: { contentType: "html", content: "  " }, body: { contentType: "text", content: "Call me Tuesday" } },
    ] }));
    store.insertReply.mockResolvedValue(true);
    await pollReplies();
    expect(store.insertReply).toHaveBeenCalledWith(expect.objectContaining({ bodyText: "Call me Tuesday" }));
  });
  it("caps the stored reply at 50 KB of UTF-8 without splitting a character", async () => {
    store.sentConversations.mockResolvedValue([{ id: "i1", conversationId: "c1" }]);
    // "é" is 2 bytes. 1 ASCII byte first makes the 50 KB cut land in the middle of an "é".
    const long = "a" + "é".repeat(30_000);
    graphFetch.mockResolvedValueOnce(json(200, { value: [
      { internetMessageId: "<r5>", from: { emailAddress: { address: "pat@example.com" } }, receivedDateTime: "2026-10-09T17:00:00Z", subject: "Re", body: { contentType: "text", content: long } },
    ] }));
    store.insertReply.mockResolvedValue(true);
    await pollReplies();
    const { bodyText } = store.insertReply.mock.calls[0][0] as { bodyText: string };
    expect(Buffer.byteLength(bodyText, "utf8")).toBeLessThanOrEqual(50 * 1024);
    expect(Buffer.byteLength(bodyText, "utf8")).toBe(50 * 1024 - 1);
    expect(bodyText).not.toContain("�");
  });
  it("does nothing inside the 2-minute window unless forced", async () => {
    store.claimReplyPoll.mockResolvedValue(false);
    expect(await pollReplies()).toEqual({ stored: 0 });
    expect(store.sentConversations).not.toHaveBeenCalled();
  });
});

it("htmlToText drops tags, scripts and entities", () => {
  expect(htmlToText("<style>p{}</style><p>Hi&nbsp;there &amp; you</p><br><div>Bye</div>")).toBe("Hi there & you\nBye");
});
