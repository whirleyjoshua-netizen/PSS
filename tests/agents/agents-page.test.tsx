import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentItem } from "@/lib/agents/rules";
import type { AgentCard } from "@/lib/agents/store";

const EMAIL_ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const DECISION_ID = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
const REPORT_ID = "5b4d0e3a-0e74-4c75-9c3e-3f4a5b6c7d8e";
const DONE_ID = "6c5e1f4b-1f85-4d86-8d4f-4a5b6c7d8e9f";
const at = new Date("2026-10-09T15:00:00Z");
const email: AgentItem = {
  id: EMAIL_ID, agentSlug: "tobi", externalId: "e-1", kind: "email", title: "Intro to Acme", summary: null, reportType: null,
  bodyMd: null, emailTo: "pat@acme.example", emailSubject: "Shades for your lobby", emailBody: "Hi Pat,\nQuick note.",
  reason: "They just opened a new office", status: "pending", ownerNote: null, finalTo: null, finalSubject: null, finalBody: null,
  sentBody: null, decidedBy: null, decidedAt: null, sentAt: null, conversationId: null, error: null, createdAt: at, updatedAt: at,
};
const decision: AgentItem = {
  ...email, id: DECISION_ID, externalId: "d-1", kind: "decision", title: "Raise ad budget?",
  bodyMd: "Spend **$25/day** more", emailTo: null, emailSubject: null, emailBody: null, reason: "Clicks are cheap",
};
const report: AgentItem = {
  ...email, id: REPORT_ID, externalId: "r-1", kind: "report", title: "Daily brief", summary: "All quiet", reportType: "daily",
  bodyMd: "## Leads\n\nTwo new", emailTo: null, emailSubject: null, emailBody: null, reason: null, status: "unread",
};
const doneDecision: AgentItem = { ...decision, id: DONE_ID, externalId: "d-0", title: "Pick a tagline", status: "approved", ownerNote: "Go with A", decidedAt: at };
// needsYou is pending + unseenReplies, as listAgentCards computes it.
const card = (over: Partial<AgentCard>): AgentCard => ({
  slug: "tara", name: "Tara", role: "Marketing", hasKey: true, statsAccess: true, dailySendCap: 10,
  lastRunAt: at, lastRunStatus: "ok", lastRunNote: null, pending: 0, unseenReplies: 0, unreadReports: 0, ...over,
  needsYou: (over.pending ?? 0) + (over.unseenReplies ?? 0),
});

const store = {
  listNeedsYou: vi.fn(), listAgentCards: vi.fn(), listRecentReplies: vi.fn(), markRepliesSeen: vi.fn(), getAgentSettings: vi.fn(),
  getItem: vi.fn(), markRead: vi.fn(), listItems: vi.fn(), listRepliesForItem: vi.fn(),
};
vi.mock("@/lib/agents/store", () => store);
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/app/admin/agents/actions", () => ({
  approveAndSend: vi.fn(async () => ({})), saveEdits: vi.fn(async () => ({})), declineItem: vi.fn(async () => ({})),
  decide: vi.fn(async () => ({})), refreshReplies: vi.fn(async () => {}), respondToReport: vi.fn(async () => ({})),
}));
const after = vi.fn();
vi.mock("next/server", () => ({ after }));
const pollReplies = vi.fn();
vi.mock("@/lib/agents/mail", () => ({ pollReplies }));

const { default: AgentsPage } = await import("@/app/admin/agents/page");
const open = async (search: Record<string, string> = {}) => render(await AgentsPage({ searchParams: Promise.resolve(search) }));
const pane = () => screen.getByText("Pick an item to read it here.");

/** Tobi has a pending email and decision, a report and a decided decision. Tara has nothing waiting. */
beforeEach(() => {
  after.mockReset();
  pollReplies.mockReset().mockResolvedValue({ stored: 0 });
  store.listAgentCards.mockReset().mockResolvedValue([
    card({ lastRunStatus: "failed", lastRunNote: "Claude login expired", unreadReports: 1 }),
    card({ slug: "tobi", name: "Tobi", role: "Outreach", pending: 2, unreadReports: 1 }),
  ]);
  store.listNeedsYou.mockReset().mockResolvedValue([email, decision]);
  store.listItems.mockReset().mockResolvedValue([report, decision, email, doneDecision]);
  store.getItem.mockReset().mockResolvedValue(null);
  store.markRead.mockReset().mockResolvedValue(undefined);
  store.listRepliesForItem.mockReset().mockResolvedValue([]);
  store.listRecentReplies.mockReset().mockResolvedValue([]);
  store.markRepliesSeen.mockReset().mockResolvedValue(undefined);
  store.getAgentSettings.mockReset().mockResolvedValue({ mailingAddress: null, signature: null, lastDigestAt: null });
});

describe("selecting an agent", () => {
  it("defaults to the first agent with something waiting, and lists every agent with its count", async () => {
    await open();
    expect(screen.getByRole("heading", { level: 2, name: "Tobi" })).toBeInTheDocument();
    expect(store.listItems).toHaveBeenCalledWith("tobi");
    expect(store.listRecentReplies).toHaveBeenCalledWith("tobi", 10);
    const nav = within(screen.getByRole("navigation", { name: "Agents" }));
    expect(nav.getByRole("link", { name: /^Tobi/ })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: /^Tobi/ })).toHaveAttribute("href", "/admin/agents?agent=tobi");
    expect(nav.getByLabelText("2 need you")).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /^Tara/ })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "+ Add agent" })).toHaveAttribute("href", "/admin/settings#agents-heading");
  });

  it("counts unseen replies on the chip, and opens the agent with one when nothing else waits", async () => {
    store.listAgentCards.mockResolvedValue([card({}), card({ slug: "tobi", name: "Tobi", unseenReplies: 1 })]);
    store.listNeedsYou.mockResolvedValue([]);
    await open();
    expect(screen.getByRole("heading", { level: 2, name: "Tobi" })).toBeInTheDocument();
    const nav = within(screen.getByRole("navigation", { name: "Agents" }));
    expect(within(nav.getByRole("link", { name: /^Tobi/ })).getByLabelText("1 need you")).toBeInTheDocument();
    expect(within(nav.getByRole("link", { name: /^Tara/ })).queryByLabelText(/need you/)).toBeNull();
    expect(store.markRepliesSeen).toHaveBeenCalledWith("tobi");
  });

  it("defaults to the first agent by name when nothing waits", async () => {
    store.listAgentCards.mockResolvedValue([card({}), card({ slug: "tobi", name: "Tobi" })]);
    await open();
    expect(screen.getByRole("heading", { level: 2, name: "Tara" })).toBeInTheDocument();
  });

  it("opens the asked-for agent, and ignores an unknown one", async () => {
    await open({ agent: "tara" });
    expect(screen.getByRole("heading", { level: 2, name: "Tara" })).toBeInTheDocument();
    expect(screen.getByText(/Claude login expired/)).toBeInTheDocument();
    // Only Tara's waiting items: Tobi's are not hers.
    expect(screen.getByText("Nothing waiting on you.")).toBeInTheDocument();
    document.body.innerHTML = "";
    await open({ agent: "nobody" });
    expect(screen.getByRole("heading", { level: 2, name: "Tobi" })).toBeInTheDocument();
  });

  it("warns when an agent has no key, and says when it hasn't run", async () => {
    store.listAgentCards.mockResolvedValue([card({ hasKey: false, lastRunAt: null, lastRunStatus: null })]);
    await open();
    expect(screen.getByText("Hasn't run yet")).toBeInTheDocument();
    expect(screen.getByText(/No key yet/)).toBeInTheDocument();
  });

  it("says when there are no agents", async () => {
    store.listAgentCards.mockResolvedValue([]);
    await open();
    expect(screen.getByText(/No agents yet/)).toBeInTheDocument();
  });
});

describe("the agent column", () => {
  it("puts the waiting items first, oldest first, then reports and what's done", async () => {
    await open();
    const waiting = within(screen.getByRole("region", { name: /Waiting on you/ }));
    expect(waiting.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Email: Intro to Acme", "Decision: Raise ad budget?"]);
    const reports = within(screen.getByRole("region", { name: "Reports" }));
    expect(reports.getByRole("article", { name: "Daily report: Daily brief" })).toBeInTheDocument();
    expect(reports.getByLabelText("unread")).toBeInTheDocument();
    const done = within(screen.getByRole("region", { name: "Done" }));
    expect(done.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"))).toEqual(["Decision: Pick a tagline"]);
    expect(done.getByText(/Decision · Approved/)).toBeInTheDocument();
  });

  it("orders Done by when each was decided or sent, newest first, not by when it was raised", async () => {
    const day = (n: number) => new Date(at.getTime() + n * 86_400_000);
    const rows: AgentItem[] = [
      // listItems returns newest-created first.
      { ...doneDecision, id: "7d6f2a5c-2a96-4e97-9e5a-5b6c7d8e9fa0", title: "Raised day 3, decided day 3", createdAt: day(3), decidedAt: day(3) },
      { ...email, id: "8e7a3b6d-3ba7-4fa8-8f6b-6c7d8e9fa0b1", title: "Raised day 2, sent day 4", status: "sent", createdAt: day(2), decidedAt: null, sentAt: day(4) },
      { ...doneDecision, title: "Raised day 0, decided day 5", createdAt: at, decidedAt: day(5) },
    ];
    store.listItems.mockResolvedValue(rows);
    await open();
    const done = within(screen.getByRole("region", { name: "Done" }));
    expect(done.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"))).toEqual([
      "Decision: Raised day 0, decided day 5", "Email: Raised day 2, sent day 4", "Decision: Raised day 3, decided day 3",
    ]);
  });

  it("gives a pending decision Approve, Decline (no note) and Expand", async () => {
    await open();
    const d = within(screen.getByRole("article", { name: "Decision: Raise ad budget?" }));
    expect(d.getByRole("button", { name: "Approve" })).toHaveAttribute("value", "approved");
    expect(d.getByRole("button", { name: "Decline" })).toHaveAttribute("value", "declined");
    expect(d.queryByRole("textbox")).toBeNull();
    // The card's excerpt is plain text: Markdown's marks are dropped.
    expect(d.getByText("Spend $25/day more")).toBeInTheDocument();
    expect(d.getByRole("link", { name: "Expand" })).toHaveAttribute("href", `/admin/agents?agent=tobi&item=${DECISION_ID}`);
  });

  it("never sends from an email card: Review & send opens it, and Decline is the only button", async () => {
    await open({ type: "daily" });
    const e = within(screen.getByRole("article", { name: "Email: Intro to Acme" }));
    expect(e.getByRole("link", { name: "Review & send" })).toHaveAttribute("href", `/admin/agents?agent=tobi&item=${EMAIL_ID}&type=daily`);
    expect(e.getAllByRole("button").map((b) => b.textContent)).toEqual(["Decline"]);
    expect(e.queryByRole("textbox")).toBeNull();
    expect(e.getByText(/Hi Pat/)).toBeInTheDocument();
  });

  it("gives an email stuck mid-send no buttons, only Expand, and says to check Outlook", async () => {
    const stuck = { ...email, status: "approved" as const, decidedAt: new Date(Date.now() - 20 * 60_000), finalTo: "pat@acme.example" };
    store.listNeedsYou.mockResolvedValue([stuck]);
    await open();
    const e = within(screen.getByRole("article", { name: "Email · status unknown: Intro to Acme" }));
    expect(e.getByRole("alert")).toHaveTextContent("Status unknown: check Sent Items in Outlook.");
    expect(e.queryByRole("button")).toBeNull();
    expect(e.getAllByRole("link").map((l) => l.textContent)).toEqual(["Expand"]);
  });

  it("gives a report only Expand", async () => {
    await open();
    const r = within(screen.getByRole("article", { name: "Daily report: Daily brief" }));
    expect(r.queryByRole("button")).toBeNull();
    expect(r.getAllByRole("link").map((l) => l.textContent)).toEqual(["Expand"]);
    expect(r.getByText("All quiet")).toBeInTheDocument();
  });

  it("filters reports by a known type only, keeping the agent", async () => {
    await open({ agent: "tobi", type: "weekly" });
    expect(store.listItems).toHaveBeenCalledWith("tobi", "weekly");
    expect(screen.getByRole("link", { name: "Weekly" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/admin/agents?agent=tobi");
    document.body.innerHTML = "";
    store.listItems.mockClear();
    await open({ agent: "tobi", type: "'; drop table" });
    expect(store.listItems).toHaveBeenCalledTimes(1);
    expect(store.listItems).toHaveBeenCalledWith("tobi");
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  });

  it("shows this agent's replies, marked new on this render, and marks them seen", async () => {
    store.listRecentReplies.mockResolvedValue([{
      id: "r1", itemId: EMAIL_ID, agentSlug: "tobi", itemTitle: "Intro to Acme", from: "pat@acme.example", receivedAt: at,
      subject: "Re: Shades", bodyText: "Sounds good, call me", seen: false,
    }]);
    await open();
    const replies = within(screen.getByRole("region", { name: "Replies" }));
    expect(replies.getByText("Sounds good, call me")).toBeInTheDocument();
    expect(replies.getByText("new")).toBeInTheDocument();
    expect(replies.getByRole("link", { name: "Expand" })).toHaveAttribute("href", `/admin/agents?agent=tobi&item=${EMAIL_ID}`);
    expect(replies.getByRole("button", { name: "Check for replies" })).toBeInTheDocument();
    // Only this agent's replies, and only after they were read for this render.
    expect(store.markRepliesSeen).toHaveBeenCalledWith("tobi");
    expect(store.markRepliesSeen.mock.invocationCallOrder[0]).toBeGreaterThan(store.listRecentReplies.mock.invocationCallOrder[0]);
  });

  it("polls for replies after the response, rate-limited (never forced), and a failed poll is only logged", async () => {
    await open();
    expect(after).toHaveBeenCalledTimes(1);
    expect(pollReplies).not.toHaveBeenCalled();
    const work = after.mock.calls[0][0] as () => Promise<void>;
    await work();
    expect(pollReplies).toHaveBeenCalledWith();
    const error = new Error("graph down");
    pollReplies.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(work()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Agent reply poll on page load failed", error);
    log.mockRestore();
  });
});

describe("the reading pane", () => {
  it("says to pick an item when none is selected, on large screens only", async () => {
    await open();
    expect(pane().parentElement).toHaveClass("hidden", "lg:block");
    expect(store.getItem).not.toHaveBeenCalled();
  });

  it("opens a report, marks it read, and offers a note to the agent", async () => {
    store.getItem.mockResolvedValue(report);
    await open({ agent: "tobi", item: REPORT_ID });
    expect(store.markRead).toHaveBeenCalledWith(REPORT_ID);
    // Marked read before the lists load, and shown read on this render.
    expect(store.markRead.mock.invocationCallOrder[0]).toBeLessThan(store.listItems.mock.invocationCallOrder[0]);
    expect(screen.getByRole("heading", { level: 2, name: "Daily brief" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Leads" })).toBeInTheDocument();
    expect(screen.getByText(/daily report ·/)).toBeInTheDocument();
    const response = within(screen.getByRole("region", { name: "My response" }));
    expect(response.getByRole("textbox", { name: "Note to Tobi" })).toHaveValue("");
    expect(response.getByRole("button", { name: "Send to Tobi" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Daily report: Daily brief" })).toHaveAttribute("aria-current", "true");
    expect(within(screen.getByRole("link", { name: /^Tobi/ })).queryByLabelText("unread reports")).toBeNull();
    expect(within(screen.getByRole("link", { name: /^Tara/ })).getByLabelText("unread reports")).toBeInTheDocument();
  });

  it("shows the note already sent on a report, and prefills it to change", async () => {
    store.getItem.mockResolvedValue({ ...report, status: "answered", ownerNote: "More on Henderson", decidedAt: at });
    await open({ agent: "tobi", item: REPORT_ID });
    const response = within(screen.getByRole("region", { name: "My response" }));
    expect(response.getByText(/Your note: More on Henderson \(sent /)).toBeInTheDocument();
    expect(response.getByRole("textbox", { name: "Note to Tobi" })).toHaveValue("More on Henderson");
  });

  it("ignores an item that belongs to another agent, and a malformed id", async () => {
    store.getItem.mockResolvedValue({ ...report, agentSlug: "tara" });
    await open({ agent: "tobi", item: REPORT_ID });
    expect(pane()).toBeInTheDocument();
    expect(store.markRead).not.toHaveBeenCalled();
    document.body.innerHTML = "";
    store.getItem.mockClear();
    await open({ agent: "tobi", item: "not-a-uuid" });
    expect(store.getItem).not.toHaveBeenCalled();
    expect(pane()).toBeInTheDocument();
  });

  it("on a phone, shows only the item with a link back to the agent", async () => {
    store.getItem.mockResolvedValue(decision);
    await open({ agent: "tobi", item: DECISION_ID, type: "weekly" });
    const back = screen.getByRole("link", { name: "← Tobi" });
    expect(back).toHaveAttribute("href", "/admin/agents?agent=tobi&type=weekly");
    expect(back).toHaveClass("lg:hidden");
    expect(screen.getByRole("navigation", { name: "Agents" }).parentElement).toHaveClass("hidden", "lg:block");
    expect(screen.getByRole("heading", { level: 2, name: "Tobi" }).closest("header")?.parentElement?.parentElement).toHaveClass("hidden", "lg:block");
  });

  it("has no back link when nothing is selected, and shows the list and column", async () => {
    await open();
    expect(screen.queryByRole("link", { name: "← Tobi" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Agents" }).parentElement).not.toHaveClass("hidden");
    expect(screen.getByRole("heading", { level: 2, name: "Tobi" }).closest("header")?.parentElement?.parentElement).not.toHaveClass("hidden");
  });

  it("gives a pending decision its body, a note and three choices", async () => {
    store.getItem.mockResolvedValue(decision);
    await open({ agent: "tobi", item: DECISION_ID });
    expect(screen.getByText("$25/day").tagName).toBe("STRONG");
    expect(screen.getByText("Why: Clicks are cheap")).toBeInTheDocument();
    const response = within(screen.getByRole("region", { name: "My response" }));
    expect(response.getByRole("textbox", { name: /Note to Tobi/ })).toBeInTheDocument();
    expect(response.getByRole("button", { name: "Approve" })).toHaveAttribute("value", "approved");
    expect(response.getByRole("button", { name: "Decline" })).toHaveAttribute("value", "declined");
    expect(response.getByRole("button", { name: "Reply with note" })).toHaveAttribute("value", "answered");
  });

  it("shows a decided decision's outcome and note, with no form", async () => {
    store.getItem.mockResolvedValue(doneDecision);
    await open({ agent: "tobi", item: DONE_ID });
    const response = within(screen.getByRole("region", { name: "My response" }));
    expect(response.getByText(/^Approved/)).toBeInTheDocument();
    expect(response.getByText("Your note: Go with A")).toBeInTheDocument();
    expect(response.queryByRole("textbox")).toBeNull();
    expect(response.queryByRole("button")).toBeNull();
    expect(screen.getByRole("listitem", { name: "Decision: Pick a tagline" })).toHaveAttribute("aria-current", "true");
  });

  it("puts the full email form in the pane, prefilled, with what is added below it", async () => {
    store.getItem.mockResolvedValue(email);
    await open({ agent: "tobi", item: EMAIL_ID });
    const e = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    expect(e.getByRole("textbox", { name: "To" })).toHaveValue("pat@acme.example");
    expect(e.getByRole("textbox", { name: "Subject" })).toHaveValue("Shades for your lobby");
    expect(e.getByRole("textbox", { name: "Body" })).toHaveValue("Hi Pat,\nQuick note.");
    expect(e.getByText(/Add a mailing address/)).toBeInTheDocument();
    for (const name of ["Approve & send", "Save edits", "Decline"]) expect(e.getByRole("button", { name })).toBeInTheDocument();
  });

  it("shows the exact footer that gets sent once a mailing address is saved", async () => {
    store.getItem.mockResolvedValue(email);
    store.getAgentSettings.mockResolvedValue({ mailingAddress: "1 Main St, Las Vegas NV", signature: "Josh\nPSS", lastDigestAt: null });
    await open({ agent: "tobi", item: EMAIL_ID });
    const e = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    const footer = e.getByLabelText("Added to every email");
    expect(footer.textContent).toBe(`--\nJosh\nPSS\n1 Main St, Las Vegas NV\n\nIf you'd rather not hear from us, just reply "no thanks".`);
    // Posted with the send, so the action can refuse if the footer changed after this render.
    const posted = new FormData(e.getByRole("textbox", { name: "Body" }).closest("form")!);
    expect(posted.get("footer")).toBe(footer.textContent);
  });

  it("prefills with the owner's saved edits, offers Retry send after a failure, and holds it for 15 minutes", async () => {
    store.getItem.mockResolvedValue({ ...email, status: "failed", error: "Outlook said no", finalTo: "lee@acme.example", finalBody: "Edited body" });
    await open({ agent: "tobi", item: EMAIL_ID });
    let e = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    expect(e.getByRole("textbox", { name: "To" })).toHaveValue("lee@acme.example");
    expect(e.getByRole("textbox", { name: "Body" })).toHaveValue("Edited body");
    expect(e.getByText("Outlook said no")).toBeInTheDocument();
    expect(e.getByRole("button", { name: "Retry send" })).toBeEnabled();
    document.body.innerHTML = "";
    store.getItem.mockResolvedValue({ ...email, status: "failed", error: "Outlook said no", decidedAt: new Date(Date.now() - 5 * 60_000) });
    await open({ agent: "tobi", item: EMAIL_ID });
    e = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    expect(e.getByRole("button", { name: "Retry send" })).toBeDisabled();
    expect(e.getByText(/Retry is available from/)).toBeInTheDocument();
  });

  it("shows a sent email's exact text and its replies, without marking anything read", async () => {
    const sent = { ...email, status: "sent" as const, sentAt: at, finalTo: "pat@acme.example", sentBody: "Hi Pat\n\n--\nPSS", ownerNote: "Softer tone" };
    store.getItem.mockResolvedValue(sent);
    store.listRepliesForItem.mockResolvedValue([{ from: "pat@acme.example", receivedAt: at, subject: "Re: Hi", bodyText: "Call me Tuesday" }]);
    await open({ agent: "tobi", item: EMAIL_ID });
    expect(screen.getByLabelText("Body").textContent).toBe("Hi Pat\n\n--\nPSS");
    expect(screen.getByText("Call me Tuesday")).toBeInTheDocument();
    expect(screen.getByText("Your note: Softer tone")).toBeInTheDocument();
    expect(store.listRepliesForItem).toHaveBeenCalledWith(EMAIL_ID);
    expect(store.markRead).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });

  it("shows To, Subject and Body for an email in every settled or sending status", async () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
    const base = { ...email, emailTo: "lee@acme.example", emailSubject: "Shades", emailBody: "Agent draft" };
    const cases: [AgentItem, string, string, string][] = [
      [{ ...base, status: "declined", finalTo: "kim@acme.example", finalBody: "Owner edit" }, "Declined email", "kim@acme.example", "Owner edit"],
      // Claimed 16 minutes ago: past the 15-minute check, so status unknown.
      [{ ...base, status: "approved", decidedAt: minutesAgo(16), finalTo: "lee@acme.example", finalBody: "Owner edit", sentBody: "Owner edit\n\n--\nPSS" },
        "Status unknown: check Sent Items in Outlook", "lee@acme.example", "Owner edit\n\n--\nPSS"],
      // Claimed 14 minutes ago: still sending.
      [{ ...base, status: "approved", decidedAt: minutesAgo(14), finalTo: "lee@acme.example", finalBody: "Owner edit", sentBody: "Owner edit\n\n--\nPSS" },
        "Sending…", "lee@acme.example", "Owner edit\n\n--\nPSS"],
    ];
    for (const [item, heading, to, body] of cases) {
      store.getItem.mockResolvedValue(item);
      const { unmount } = await open({ agent: "tobi", item: EMAIL_ID });
      expect(screen.getByRole("heading", { level: 3, name: heading })).toBeInTheDocument();
      expect(screen.getByText(to)).toBeInTheDocument();
      expect(screen.getByText("Shades")).toBeInTheDocument();
      expect(screen.getByLabelText("Body").textContent).toBe(body);
      expect(within(screen.getByRole("article", { name: "Intro to Acme" })).queryByRole("button")).toBeNull();
      unmount();
    }
    expect(store.listRepliesForItem).not.toHaveBeenCalled();
  });
});
