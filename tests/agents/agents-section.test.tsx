import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@/lib/agents/rules";

const actions = {
  addAgentAction: vi.fn(async () => ({})),
  createKeyAction: vi.fn(async () => ({})),
  saveAgentSettingsAction: vi.fn(async () => ({})),
  addSuppressionAction: vi.fn(async () => ({})),
  removeSuppressionAction: vi.fn(),
};
vi.mock("@/app/admin/settings/agent-actions", () => actions);

const { AgentsSection } = await import("@/app/admin/settings/AgentsSection");
const { defaultSignature } = await import("@/lib/agents/rules");

const agent = (over: Partial<Agent>): Agent => ({
  slug: "tara", name: "Tara", role: "Marketing", hasKey: true, statsAccess: true, dailySendCap: 10,
  lastRunAt: null, lastRunStatus: null, lastRunNote: null, ...over,
});
const agents = [agent({}), agent({ slug: "tobi", name: "Tobi", role: "Outreach", hasKey: false, statsAccess: false })];
const noSettings = { mailingAddress: null, signature: null };

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockClear();
});

describe("agents section", () => {
  it("is headed Agents with the anchor the dashboard links to", () => {
    render(<AgentsSection agents={agents} settings={noSettings} suppressions={[]} />);
    const heading = screen.getByRole("heading", { name: "Agents" });
    expect(heading).toHaveAttribute("id", "agents-heading");
    expect(screen.getByRole("region", { name: "Agents" })).toBeInTheDocument();
  });

  it("offers Replace key for an agent with a key and Create key for one without", () => {
    render(<AgentsSection agents={agents} settings={noSettings} suppressions={[]} />);
    const tara = screen.getByText("Tara").closest("li")!;
    const tobi = screen.getByText("Tobi").closest("li")!;
    expect(within(tara).getByRole("button", { name: "Replace key" })).toBeInTheDocument();
    expect(within(tara).queryByRole("button", { name: "Create key" })).toBeNull();
    expect(within(tobi).getByRole("button", { name: "Create key" })).toBeInTheDocument();
    expect(within(tobi).queryByRole("button", { name: "Replace key" })).toBeNull();
    expect(tobi).toHaveTextContent("No key yet");
  });

  it("asks inline before replacing a key", async () => {
    render(<AgentsSection agents={agents} settings={noSettings} suppressions={[]} />);
    const tara = screen.getByText("Tara").closest("li")!;
    await userEvent.click(within(tara).getByRole("button", { name: "Replace key" }));
    expect(actions.createKeyAction).not.toHaveBeenCalled();
    expect(within(tara).getByRole("button", { name: "Yes, replace. The old key stops working" })).toBeInTheDocument();
  });

  it("has the mailing address field, saved values, and the default signature hint", () => {
    render(<AgentsSection agents={agents} settings={{ mailingAddress: "PO Box 1", signature: null }} suppressions={[]} />);
    expect(screen.getByLabelText("Mailing address")).toHaveValue("PO Box 1");
    expect(screen.getByLabelText("Email signature")).toHaveValue("");
    expect(screen.getByText(/required before any email can be sent/)).toBeInTheDocument();
    const firstLine = defaultSignature().split("\n")[0];
    expect(screen.getByText(new RegExp(firstLine))).toBeInTheDocument();
  });

  it("says the do-not-contact list is empty", () => {
    render(<AgentsSection agents={agents} settings={noSettings} suppressions={[]} />);
    expect(screen.getByText("No one is on the do-not-contact list.")).toBeInTheDocument();
  });

  it("lists do-not-contact addresses with Remove", () => {
    const suppressions = [{ address: "bob@example.com", reason: "Replied no thanks", source: "reply", createdAt: new Date("2026-10-01T18:00:00Z") }];
    render(<AgentsSection agents={agents} settings={noSettings} suppressions={suppressions} />);
    expect(screen.getByRole("button", { name: "Remove bob@example.com" })).toBeInTheDocument();
    expect(screen.queryByText("No one is on the do-not-contact list.")).toBeNull();
  });

  it("offers an add-agent form with a cap of 10 by default", () => {
    render(<AgentsSection agents={agents} settings={noSettings} suppressions={[]} />);
    expect(screen.getByLabelText("Daily email limit")).toHaveValue(10);
    expect(screen.getByRole("button", { name: "Add agent" })).toBeInTheDocument();
  });
});
