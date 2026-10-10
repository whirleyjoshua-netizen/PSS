import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentItem } from "@/lib/agents/rules";
import type { AgentCard } from "@/lib/agents/store";

const EMAIL_ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const DECISION_ID = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
const REPORT_ID = "5b4d0e3a-0e74-4c75-9c3e-3f4a5b6c7d8e";
const at = new Date("2026-10-09T15:00:00Z");
const base: AgentItem = {
  id: EMAIL_ID, agentSlug: "tobi", externalId: "e-1", kind: "email", title: "Intro to Acme", summary: null, reportType: null,
  bodyMd: null, emailTo: "pat@acme.example", emailSubject: "Shades for your lobby", emailBody: "Hi Pat,\nQuick note.",
  reason: "They just opened a new office", status: "pending", ownerNote: null, finalTo: null, finalSubject: null, finalBody: null,
  sentBody: null, decidedBy: null, decidedAt: null, sentAt: null, conversationId: null, error: null, createdAt: at, updatedAt: at,
};
const decision: AgentItem = {
  ...base, id: DECISION_ID, agentSlug: "tara", externalId: "d-1", kind: "decision", title: "Raise ad budget?",
  bodyMd: "Spend **$25/day** more", emailTo: null, emailSubject: null, emailBody: null, reason: "Clicks are cheap",
};
const card = (over: Partial<AgentCard>): AgentCard => ({
  slug: "tara", name: "Tara", role: "Marketing", hasKey: true, statsAccess: true, dailySendCap: 10,
  lastRunAt: at, lastRunStatus: "ok", lastRunNote: null, pending: 1, unreadReports: 1, newestReport: null, ...over,
});

const store = {
  listNeedsYou: vi.fn(), listAgentCards: vi.fn(), listRecentReplies: vi.fn(), markRepliesSeen: vi.fn(), getAgentSettings: vi.fn(),
};
vi.mock("@/lib/agents/store", () => store);
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/app/admin/agents/actions", () => ({
  approveAndSend: vi.fn(async () => ({})), saveEdits: vi.fn(async () => ({})), declineItem: vi.fn(async () => ({})),
  decide: vi.fn(async () => ({})), refreshReplies: vi.fn(async () => {}),
}));
const after = vi.fn();
vi.mock("next/server", () => ({ after }));
const pollReplies = vi.fn();
vi.mock("@/lib/agents/mail", () => ({ pollReplies }));

const { default: AgentsPage } = await import("@/app/admin/agents/page");

beforeEach(() => {
  after.mockReset();
  pollReplies.mockReset().mockResolvedValue({ stored: 0 });
  store.listNeedsYou.mockReset().mockResolvedValue([base, decision]);
  store.listAgentCards.mockReset().mockResolvedValue([
    card({
      lastRunStatus: "failed", lastRunNote: "Claude login expired",
      newestReport: { id: REPORT_ID, title: "Daily brief", summary: "All quiet", status: "unread", createdAt: at },
    }),
    card({ slug: "tobi", name: "Tobi", role: "Outreach", newestReport: null }),
  ]);
  store.listRecentReplies.mockReset().mockResolvedValue([]);
  store.markRepliesSeen.mockReset().mockResolvedValue(undefined);
  store.getAgentSettings.mockReset().mockResolvedValue({ mailingAddress: null, signature: null, lastDigestAt: null });
});

describe("AgentsPage", () => {
  it("puts both cards under Needs you", async () => {
    render(await AgentsPage());
    expect(screen.getByRole("heading", { name: /Needs you/ })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Decision from Tara: Raise ad budget?" })).toBeInTheDocument();
  });

  it("prefills the email card with the proposal and shows what is added below it", async () => {
    render(await AgentsPage());
    const email = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    expect(email.getByRole("textbox", { name: "To" })).toHaveValue("pat@acme.example");
    expect(email.getByRole("textbox", { name: "Subject" })).toHaveValue("Shades for your lobby");
    expect(email.getByRole("textbox", { name: "Body" })).toHaveValue("Hi Pat,\nQuick note.");
    expect(email.getByText(/Add a mailing address/)).toBeInTheDocument();
    expect(email.getByRole("button", { name: "Approve & send" })).toBeInTheDocument();
    expect(email.getByRole("button", { name: "Save edits" })).toBeInTheDocument();
    expect(email.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("prefills with the owner's saved edits, and offers Retry send after a failure", async () => {
    store.listNeedsYou.mockResolvedValue([{ ...base, status: "failed", error: "Outlook said no", finalTo: "lee@acme.example", finalSubject: "Edited", finalBody: "Edited body" }]);
    render(await AgentsPage());
    const email = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    expect(email.getByRole("textbox", { name: "To" })).toHaveValue("lee@acme.example");
    expect(email.getByRole("textbox", { name: "Body" })).toHaveValue("Edited body");
    expect(email.getByRole("button", { name: "Retry send" })).toBeInTheDocument();
    expect(email.getByText("Outlook said no")).toBeInTheDocument();
    // Its last attempt (at, Oct 9) is long past, so Retry is open.
    expect(email.getByRole("button", { name: "Retry send" })).toBeEnabled();
  });

  it("holds Retry for 15 minutes after the last attempt", async () => {
    const decidedAt = new Date(Date.now() - 5 * 60_000);
    store.listNeedsYou.mockResolvedValue([{ ...base, status: "failed", error: "Outlook said no", decidedAt }]);
    render(await AgentsPage());
    const email = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    expect(email.getByRole("button", { name: "Retry send" })).toBeDisabled();
    expect(email.getByText(/Retry is available from/)).toBeInTheDocument();
  });

  it("shows the exact footer that gets sent once a mailing address is saved", async () => {
    store.getAgentSettings.mockResolvedValue({ mailingAddress: "1 Main St, Las Vegas NV", signature: "Josh\nPSS", lastDigestAt: null });
    render(await AgentsPage());
    const email = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    const footer = email.getByLabelText("Added to every email");
    expect(footer.textContent).toBe(`--\nJosh\nPSS\n1 Main St, Las Vegas NV\n\nIf you'd rather not hear from us, just reply "no thanks".`);
    expect(email.queryByText(/Add a mailing address/)).toBeNull();
    // Posted with the send, so the action can refuse if the footer changed after this render.
    const posted = new FormData(screen.getByRole("textbox", { name: "Body" }).closest("form")!);
    expect(posted.get("footer")).toBe(footer.textContent);
  });

  it("gives the decision card its body, a note and three choices", async () => {
    render(await AgentsPage());
    const d = within(screen.getByRole("article", { name: "Decision from Tara: Raise ad budget?" }));
    expect(d.getByText("$25/day").tagName).toBe("STRONG");
    expect(d.getByRole("textbox", { name: /Note/ })).toBeInTheDocument();
    for (const name of ["Approve", "Decline", "Reply with note"]) expect(d.getByRole("button", { name })).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Approve" })).toHaveAttribute("value", "approved");
    expect(d.getByRole("button", { name: "Decline" })).toHaveAttribute("value", "declined");
    expect(d.getByRole("button", { name: "Reply with note" })).toHaveAttribute("value", "answered");
  });

  it("shows each agent, a failed run's note and the newest report", async () => {
    render(await AgentsPage());
    expect(screen.getByText(/Claude login expired/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tara" })).toHaveAttribute("href", "/admin/agents/tara");
    expect(screen.getByRole("link", { name: /Daily brief/ })).toHaveAttribute("href", `/admin/agents/tara/${REPORT_ID}`);
  });

  it("polls for replies after the response, rate-limited (never forced), and a failed poll is only logged", async () => {
    render(await AgentsPage());
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

  it("lists an email stuck mid-send as status unknown, with no buttons", async () => {
    store.listNeedsYou.mockResolvedValue([{ ...base, status: "approved", finalTo: "pat@acme.example", sentBody: "Hi Pat\n\n--\nPSS" }]);
    render(await AgentsPage());
    const email = within(screen.getByRole("article", { name: "Email from Tobi: Intro to Acme" }));
    expect(email.getByRole("alert")).toHaveTextContent("Status unknown: check Sent Items in Outlook.");
    expect(email.queryByRole("button")).toBeNull();
    expect(email.getByRole("link", { name: "See the email" })).toHaveAttribute("href", `/admin/agents/tobi/${EMAIL_ID}`);
  });

  it("says when nothing is waiting", async () => {
    store.listNeedsYou.mockResolvedValue([]);
    render(await AgentsPage());
    expect(screen.getByText("Nothing waiting on you.")).toBeInTheDocument();
  });

  it("marks replies seen once shown", async () => {
    store.listRecentReplies.mockResolvedValue([{
      id: "r1", itemId: EMAIL_ID, agentSlug: "tobi", itemTitle: "Intro to Acme", from: "pat@acme.example", receivedAt: at,
      subject: "Re: Shades", bodyText: "Sounds good, call me", seen: false,
    }]);
    render(await AgentsPage());
    expect(store.markRepliesSeen).toHaveBeenCalled();
    expect(screen.getByText("Sounds good, call me")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for replies" })).toBeInTheDocument();
  });
});
