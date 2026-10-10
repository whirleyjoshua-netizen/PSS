import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentItem } from "@/lib/agents/rules";

const actions = { approveAndSend: vi.fn(), saveEdits: vi.fn(), declineItem: vi.fn() };
vi.mock("@/app/admin/agents/actions", () => actions);
const { EmailCard } = await import("@/app/admin/agents/EmailCard");

const at = new Date("2026-10-09T15:00:00Z");
const item: AgentItem = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", agentSlug: "tobi", externalId: "e-1", kind: "email", title: "Intro to Acme", summary: null,
  reportType: null, bodyMd: null, emailTo: "pat@acme.example", emailSubject: "Shades", emailBody: "Hi Pat", reason: null, status: "pending",
  ownerNote: null, finalTo: null, finalSubject: null, finalBody: null, sentBody: null, decidedBy: null, decidedAt: null, sentAt: null,
  conversationId: null, error: null, createdAt: at, updatedAt: at,
};

beforeEach(() => {
  actions.approveAndSend.mockReset().mockResolvedValue({ error: "Microsoft didn't answer. It isn't in Sent Items, so it wasn't sent. You can retry." });
  actions.saveEdits.mockReset().mockResolvedValue({ ok: "Edits saved." });
  actions.declineItem.mockReset().mockResolvedValue({ ok: "Declined." });
});

describe("EmailCard", () => {
  it("clears a stale send error once a later save succeeds", async () => {
    const user = userEvent.setup();
    render(<EmailCard item={item} agentName="Tobi" footer={"--\nPSS"} />);
    await user.click(screen.getByRole("button", { name: "Approve & send" }));
    expect(await screen.findByText(/It isn't in Sent Items/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save edits" }));
    expect(await screen.findByText("Edits saved.")).toBeInTheDocument();
    expect(screen.queryByText(/It isn't in Sent Items/)).toBeNull();
  });
  it("shows a later send result after a save", async () => {
    actions.approveAndSend.mockResolvedValue({ ok: "Sent." });
    const user = userEvent.setup();
    render(<EmailCard item={item} agentName="Tobi" footer={"--\nPSS"} />);
    await user.click(screen.getByRole("button", { name: "Save edits" }));
    expect(await screen.findByText("Edits saved.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve & send" }));
    expect(await screen.findByText("Sent.")).toBeInTheDocument();
    expect(screen.queryByText("Edits saved.")).toBeNull();
  });
  it("disables Retry until the wait is over, and says when it opens", () => {
    render(<EmailCard item={{ ...item, status: "failed", error: "x" }} agentName="Tobi" footer={"--\nPSS"} retryAt={new Date("2026-10-09T17:15:00Z")} />);
    expect(screen.getByRole("button", { name: "Retry send" })).toBeDisabled();
    expect(screen.getByText(/Retry is available from Fri, Oct 9, 10:15 AM/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save edits" })).toBeEnabled();
  });
  it("offers Retry when there is no wait", () => {
    render(<EmailCard item={{ ...item, status: "failed", error: "x" }} agentName="Tobi" footer={"--\nPSS"} />);
    expect(screen.getByRole("button", { name: "Retry send" })).toBeEnabled();
    expect(screen.queryByText(/Retry is available from/)).toBeNull();
  });
});
