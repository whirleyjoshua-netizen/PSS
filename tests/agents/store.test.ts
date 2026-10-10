import { beforeEach, describe, expect, it, vi } from "vitest";
const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/agents/store");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const values = (call: unknown[]) => call.slice(1);
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const itemRow = {
  id: ID, agent_slug: "tobi", external_id: "e-1", kind: "email", title: "Intro", summary: null, report_type: null, body_md: null,
  email_to: "pat@example.com", email_subject: "Hello", email_body: "Hi", reason: "r", status: "pending", owner_note: null,
  final_to: null, final_subject: null, final_body: null, sent_body: null, decided_by: null, decided_at: null, sent_at: null,
  conversation_id: null, error: null, created_at: "2026-10-09T15:00:00Z", updated_at: "2026-10-09T15:00:00Z",
};
beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("upsertItem", () => {
  const email = { kind: "email" as const, external_id: "e-1", title: "Intro", email_to: "pat@example.com", email_subject: "Hello", email_body: "Hi" };
  it("inserts as pending and updates only while the owner hasn't acted", async () => {
    sql.mockResolvedValue([{ created: true }]);
    expect(await store.upsertItem("tobi", email)).toBe("created");
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("on conflict (agent_slug, external_id) do update set");
    expect(q).toContain("where agent_items.status in ('unread', 'pending')");
    expect(q).not.toMatch(/final_(to|subject|body)\s*=/); // owner edits are never overwritten by a push
    expect(values(sql.mock.calls[0])).toContain("pending");
  });
  it("answers updated, or locked when the row was decided", async () => {
    sql.mockResolvedValue([{ created: false }]);
    expect(await store.upsertItem("tobi", email)).toBe("updated");
    sql.mockResolvedValue([]);
    expect(await store.upsertItem("tobi", email)).toBe("locked");
  });
  it("stores a report as unread", async () => {
    sql.mockResolvedValue([{ created: true }]);
    await store.upsertItem("tara", { kind: "report", external_id: "r", title: "t", report_type: "daily", body_md: "# x" });
    expect(values(sql.mock.calls[0])).toContain("unread");
  });
});

describe("claimForSend", () => {
  it("claims only a pending or failed email, in one statement, keeping owner edits", async () => {
    sql.mockResolvedValue([{ ...itemRow, earlier_attempt_at: null }]);
    expect(await store.claimForSend(ID, "owner@example.com")).toMatchObject({ item: { id: ID, kind: "email" }, earlierAttemptAt: null });
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("status = 'approved'");
    expect(q).toContain("final_to = coalesce(final_to, email_to)");
    expect(q).toContain("where id = ? and kind = 'email' and (status = 'pending'");
    expect(q).toContain("for update");
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("claims a failed email again only 15 minutes after its last attempt was claimed", async () => {
    await store.claimForSend(ID, "o@x.co");
    expect(text(sql.mock.calls[0])).toContain("or (status = 'failed' and coalesce(decided_at, created_at) <= now() - make_interval(mins => ?))");
    expect(values(sql.mock.calls[0])).toContain(15);
  });
  it("tells the sender when a failed email's last attempt was claimed, so a retry checks Sent Items first", async () => {
    sql.mockResolvedValue([{ ...itemRow, status: "approved", earlier_attempt_at: "2026-10-09T17:00:00Z" }]);
    expect((await store.claimForSend(ID, "o@x.co"))?.earlierAttemptAt).toEqual(new Date("2026-10-09T17:00:00Z"));
    expect(text(sql.mock.calls[0])).toContain("case when prev.status = 'failed' then coalesce(prev.decided_at, prev.created_at) end as earlier_attempt_at");
  });
  it("answers null when someone else got there first", async () => {
    sql.mockResolvedValue([]);
    expect(await store.claimForSend(ID, "owner@example.com")).toBeNull();
  });
});

describe("recording a send", () => {
  it("markSent and markFailed only move an email that is still claimed ('approved')", async () => {
    await store.markSent(ID, { sentBody: null, graphMessageId: null, conversationId: null, internetMessageId: null });
    await store.markFailed(ID, "boom");
    for (const call of sql.mock.calls) expect(text(call)).toMatch(/where id = \? and status = 'approved'$/);
    expect(text(sql.mock.calls[0])).toContain("sent_body = coalesce(?, sent_body)");
  });
  it("setSendingBody writes the composed text on the claimed row before the send", async () => {
    await store.setSendingBody(ID, "Hi\n\n--\nPSS");
    expect(text(sql.mock.calls[0])).toContain("set sent_body = ?, updated_at = now() where id = ? and status = 'approved'");
    expect(values(sql.mock.calls[0])).toEqual(["Hi\n\n--\nPSS", ID]);
  });
  it("setSentIds fills in only a sent row still missing its conversation id", async () => {
    await store.setSentIds(ID, { graphMessageId: "g", conversationId: "c", internetMessageId: "m" });
    expect(text(sql.mock.calls[0])).toContain("where id = ? and status = 'sent' and conversation_id is null");
  });
  it("sentWithoutIds and stuckApproved find what the reply poll settles from Sent Items", async () => {
    sql.mockResolvedValueOnce([{ id: ID, sent_at: "2026-10-09T17:00:00Z" }]).mockResolvedValueOnce([{ id: ID, claimed_at: "2026-10-09T16:00:00Z" }]);
    expect(await store.sentWithoutIds(60, 10)).toEqual([{ id: ID, sentAt: new Date("2026-10-09T17:00:00Z") }]);
    expect(await store.stuckApproved(15, 10)).toEqual([{ id: ID, claimedAt: new Date("2026-10-09T16:00:00Z") }]);
    expect(text(sql.mock.calls[0])).toContain("status = 'sent' and conversation_id is null and sent_at > now() - make_interval(days => ?) order by sent_at limit ?");
    expect(values(sql.mock.calls[0])).toEqual([60, 10]);
    expect(text(sql.mock.calls[1])).toContain("status = 'approved' and coalesce(decided_at, updated_at) <= now() - make_interval(mins => ?) order by claimed_at limit ?");
    expect(values(sql.mock.calls[1])).toEqual([15, 10]);
  });
});

describe("pull", () => {
  it("returns and marks delivered only decided items of this agent, in one statement", async () => {
    await store.pullUpdates("tara");
    const q = text(sql.mock.calls[0]);
    expect(q).toMatch(/^ ?update agent_items set delivered_at = now\(\) where agent_slug = \? and delivered_at is null and status not in \('unread', 'read', 'pending'\) returning/);
    expect(values(sql.mock.calls[0])).toEqual(["tara"]);
  });
  it("replies: only this agent's, marked delivered", async () => {
    await store.pullReplies("tobi");
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("from agent_items i where r.item_id = i.id and i.agent_slug = ? and r.delivered_at is null");
  });
});

describe("decisions reset delivery so the agent hears about them", () => {
  it("decideItem, markSent and markFailed set delivered_at = null", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await store.decideItem(ID, { status: "declined", note: "not now", by: "o@x.co" });
    await store.markSent(ID, { sentBody: "b", graphMessageId: "g", conversationId: "c", internetMessageId: "m" });
    await store.markFailed(ID, "boom");
    for (const call of sql.mock.calls) expect(text(call)).toContain("delivered_at = null");
  });
  it("decideItem decides a pending item, and can also decline (only decline) an email whose send failed", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await store.decideItem(ID, { status: "declined", note: null, by: "o@x.co" })).toBe(true);
    expect(text(sql.mock.calls[0])).toContain(
      "where id = ? and (kind = 'decision' or ? = 'declined') and (status = 'pending' or (kind = 'email' and status = 'failed' and ? = 'declined'))",
    );
    expect(values(sql.mock.calls[0]).slice(-3)).toEqual([ID, "declined", "declined"]);
  });
});

describe("sentTodayCount", () => {
  it("counts sends on the Las Vegas calendar day", async () => {
    sql.mockResolvedValue([{ n: 3 }]);
    expect(await store.sentTodayCount("tobi", "2026-10-09")).toBe(3);
    expect(text(sql.mock.calls[0])).toContain("(sent_at at time zone 'America/Los_Angeles')::date = ?::date");
  });
});

describe("claimReplyPoll", () => {
  it("is one conditional update with a 2-minute window, answering the previous poll time", async () => {
    sql.mockResolvedValue([{ claimed_at: "2026-10-09 18:00:00.123456+00", previous: "2026-10-09T17:00:00Z" }]);
    expect(await store.claimReplyPoll()).toEqual({ claimedAt: "2026-10-09 18:00:00.123456+00", previous: new Date("2026-10-09T17:00:00Z") });
    expect(text(sql.mock.calls[0])).toContain("(?::boolean or p.previous is null or p.previous < now() - interval '2 minutes')");
    expect(values(sql.mock.calls[0])).toEqual([false]);
    await store.claimReplyPoll(true);
    expect(values(sql.mock.calls[1])).toEqual([true]);
    sql.mockResolvedValue([]);
    expect(await store.claimReplyPoll()).toBeNull();
  });
  it("releaseReplyPoll moves the mark back only if no other poll claimed since", async () => {
    await store.releaseReplyPoll("2026-10-09 18:00:00.123456+00", new Date("2026-10-09T17:00:00Z"));
    expect(text(sql.mock.calls[0])).toContain("set last_reply_poll_at = ?::timestamptz where id and last_reply_poll_at = ?::timestamptz");
    expect(values(sql.mock.calls[0])).toEqual(["2026-10-09T17:00:00.000Z", "2026-10-09 18:00:00.123456+00"]);
  });
});

describe("suppressions", () => {
  it("normalizes the address", async () => {
    await store.addSuppression("  Pat@Example.COM ", "replied no thanks", "reply");
    expect(values(sql.mock.calls[0])[0]).toBe("pat@example.com");
    expect(text(sql.mock.calls[0])).toContain("on conflict (address) do nothing");
  });
});

describe("needs you", () => {
  it("lists pending and failed items, and emails claimed 15 or more minutes ago and unsettled, everywhere it is counted", async () => {
    sql.mockResolvedValue([]);
    sql.query.mockResolvedValue([{ n: 0 }]);
    await store.listNeedsYou();
    await store.needsYouCount();
    await store.listAgentCards();
    await store.digestFacts(null);
    // The same 15 minutes as the "Sending…" heading and the reply poll's check.
    const stuck = "or (kind = 'email' and status = 'approved' and coalesce(decided_at, updated_at) <= now() - interval '15 minutes')";
    const queries = sql.query.mock.calls.map((c) => String(c[0]).replace(/\s+/g, " "));
    expect(queries).toHaveLength(4);
    for (const q of queries) expect(q).toContain(stuck);
  });
});

describe("getItem", () => {
  it("never queries for a malformed id, and maps a row", async () => {
    expect(await store.getItem("not-a-uuid")).toBeNull();
    expect(sql.query).not.toHaveBeenCalled();
    sql.query.mockResolvedValue([itemRow]);
    expect(await store.getItem(ID)).toMatchObject({ id: ID, emailTo: "pat@example.com", createdAt: new Date("2026-10-09T15:00:00Z") });
    expect(sql.query.mock.calls[0][1]).toEqual([ID]);
  });
});

describe("listRepliesForItem", () => {
  it("reads one email's replies, oldest first, and maps them", async () => {
    sql.mockResolvedValue([{ from_address: "pat@example.com", received_at: "2026-10-09T16:00:00Z", subject: "Re: Hello", body_text: "Sure" }]);
    expect(await store.listRepliesForItem(ID)).toEqual([
      { from: "pat@example.com", receivedAt: new Date("2026-10-09T16:00:00Z"), subject: "Re: Hello", bodyText: "Sure" },
    ]);
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("select from_address, received_at, subject, body_text from agent_replies where item_id = ? order by received_at");
    expect(values(sql.mock.calls[0])).toEqual([ID]);
  });
  it("never queries for a malformed id", async () => {
    expect(await store.listRepliesForItem("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});
