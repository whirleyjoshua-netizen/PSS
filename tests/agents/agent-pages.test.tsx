import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, AgentItem } from "@/lib/agents/rules";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const at = new Date("2026-10-09T15:00:00Z");
const agent: Agent = {
  slug: "tara", name: "Tara", role: "Marketing", hasKey: true, statsAccess: true, dailySendCap: 10,
  lastRunAt: at, lastRunStatus: "ok", lastRunNote: null,
};
const report: AgentItem = {
  id: ID, agentSlug: "tara", externalId: "r-1", kind: "report", title: "Daily brief", summary: "All quiet", reportType: "daily",
  bodyMd: "## Leads\n\nTwo new", emailTo: null, emailSubject: null, emailBody: null, reason: null, status: "unread", ownerNote: null,
  finalTo: null, finalSubject: null, finalBody: null, sentBody: null, decidedBy: null, decidedAt: null, sentAt: null,
  conversationId: null, error: null, createdAt: at, updatedAt: at,
};
const sentEmail: AgentItem = {
  ...report, id: "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d", kind: "email", title: "Intro to Acme", reportType: null, bodyMd: null,
  status: "sent", sentAt: at, sentBody: "Hi Pat\n\n--\nPSS", ownerNote: "Softer tone",
};

const store = { getAgent: vi.fn(), listItems: vi.fn(), getItem: vi.fn(), markRead: vi.fn(), listRepliesForItem: vi.fn() };
vi.mock("@/lib/agents/store", () => store);
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound }));

const { default: AgentPage } = await import("@/app/admin/agents/[slug]/page");
const { default: ItemPage } = await import("@/app/admin/agents/[slug]/[itemId]/page");
const openAgent = async (slug: string, type?: string) =>
  render(await AgentPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(type ? { type } : {}) }));
const openItem = async (slug: string, itemId: string) => render(await ItemPage({ params: Promise.resolve({ slug, itemId }) }));

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset();
  store.getAgent.mockResolvedValue(agent);
  store.listItems.mockResolvedValue([report, sentEmail]);
  store.getItem.mockResolvedValue(report);
  store.markRead.mockResolvedValue(undefined);
  store.listRepliesForItem.mockResolvedValue([]);
  notFound.mockClear();
});

describe("agent page", () => {
  it("404s for an unknown agent", async () => {
    store.getAgent.mockResolvedValue(null);
    await expect(openAgent("nobody")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lists reports and emails/decisions separately", async () => {
    await openAgent("tara");
    expect(screen.getByRole("heading", { level: 1, name: "Tara" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Daily brief/ })).toHaveAttribute("href", `/admin/agents/tara/${ID}`);
    expect(screen.getByRole("link", { name: /Intro to Acme/ })).toHaveAttribute("href", `/admin/agents/tara/${sentEmail.id}`);
    expect(screen.getByText("Softer tone", { exact: false })).toBeInTheDocument();
    expect(store.listItems).toHaveBeenCalledWith("tara", undefined);
  });

  it("filters by a known report type only", async () => {
    await openAgent("tara", "weekly");
    expect(store.listItems).toHaveBeenLastCalledWith("tara", "weekly");
    expect(screen.getByRole("link", { name: "Weekly" })).toHaveAttribute("aria-current", "page");
    await openAgent("tara", "'; drop table");
    expect(store.listItems).toHaveBeenLastCalledWith("tara", undefined);
  });
});

describe("item page", () => {
  it("renders the report and marks it read", async () => {
    await openItem("tara", ID);
    expect(screen.getByRole("heading", { level: 1, name: "Daily brief" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Leads" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Tara" })).toHaveAttribute("href", "/admin/agents/tara");
    expect(store.markRead).toHaveBeenCalledWith(ID);
  });

  it("404s when the item belongs to another agent or is missing", async () => {
    await expect(openItem("tobi", ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(store.markRead).not.toHaveBeenCalled();
    store.getItem.mockResolvedValue(null);
    await expect(openItem("tara", ID)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows a sent email's exact text and its replies, without marking it read", async () => {
    store.getItem.mockResolvedValue(sentEmail);
    store.listRepliesForItem.mockResolvedValue([{ from: "pat@acme.example", receivedAt: at, subject: "Re: Hi", bodyText: "Call me Tuesday" }]);
    await openItem("tara", sentEmail.id);
    expect(screen.getByText(/Hi Pat/).tagName).toBe("PRE");
    expect(screen.getByText("Call me Tuesday")).toBeInTheDocument();
    expect(screen.getByText(/pat@acme\.example/)).toBeInTheDocument();
    expect(store.listRepliesForItem).toHaveBeenCalledWith(sentEmail.id);
    expect(store.markRead).not.toHaveBeenCalled();
  });

  it("shows To, Subject and Body for an email in every status, not only sent", async () => {
    const email = { ...sentEmail, status: "pending" as const, sentAt: null, sentBody: null, emailTo: "lee@acme.example", emailSubject: "Shades", emailBody: "Agent draft" };
    const cases: [AgentItem, string, string, string][] = [
      [email, "Proposed email", "lee@acme.example", "Agent draft"],
      [{ ...email, status: "declined", finalTo: "kim@acme.example", finalBody: "Owner edit" }, "Declined email", "kim@acme.example", "Owner edit"],
      [{ ...email, status: "failed", error: "Microsoft refused the email (400)", finalBody: "Owner edit" }, "Send failed", "lee@acme.example", "Owner edit"],
      [{ ...email, status: "approved", finalTo: "lee@acme.example", finalBody: "Owner edit", sentBody: "Owner edit\n\n--\nPSS" },
        "Status unknown: check Sent Items in Outlook", "lee@acme.example", "Owner edit\n\n--\nPSS"],
    ];
    for (const [item, heading, to, body] of cases) {
      store.getItem.mockResolvedValue(item);
      const { unmount } = await openItem("tara", item.id);
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
      expect(screen.getByText(to)).toBeInTheDocument();
      expect(screen.getByText("Shades")).toBeInTheDocument();
      expect(screen.getByLabelText("Body").textContent).toBe(body);
      unmount();
    }
    expect(store.listRepliesForItem).not.toHaveBeenCalled();
  });
});
