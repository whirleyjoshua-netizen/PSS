import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = {
  decide: vi.fn(), declineItem: vi.fn(), approveAndSend: vi.fn(), saveEdits: vi.fn(), respondToReport: vi.fn(), refreshReplies: vi.fn(),
};
vi.mock("@/app/admin/agents/actions", () => actions);
const { DecisionCardActions, EmailCardActions } = await import("@/app/admin/agents/CardActions");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const EXPAND = `/admin/agents?agent=tobi&item=${ID}`;

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.decide.mockResolvedValue({ ok: "Saved." });
  actions.declineItem.mockResolvedValue({ ok: "Declined." });
});

/** The bound action is called as (id, previous state, form). */
const submitted = (fn: ReturnType<typeof vi.fn>) => {
  expect(fn).toHaveBeenCalledTimes(1);
  const [id, , form] = fn.mock.calls[0] as [string, unknown, FormData];
  return { id, form };
};

describe("decision card buttons", () => {
  for (const [button, choice] of [["Approve", "approved"], ["Decline", "declined"]] as const) {
    it(`${button} decides this item as ${choice}, with no note`, async () => {
      render(<DecisionCardActions id={ID} expandHref={EXPAND} />);
      await userEvent.setup().click(screen.getByRole("button", { name: button }));
      const { id, form } = submitted(actions.decide);
      expect(id).toBe(ID);
      expect(form.get("choice")).toBe(choice);
      expect(form.get("note")).toBeNull();
      expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
      expect(actions.declineItem).not.toHaveBeenCalled();
      expect(actions.approveAndSend).not.toHaveBeenCalled();
    });
  }
});

describe("email card buttons", () => {
  it("Decline declines this email with no note, and nothing sends", async () => {
    render(<EmailCardActions id={ID} expandHref={EXPAND} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Decline" }));
    const { id, form } = submitted(actions.declineItem);
    expect(id).toBe(ID);
    expect(form.get("note")).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent("Declined.");
    expect(actions.decide).not.toHaveBeenCalled();
    expect(actions.approveAndSend).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Review & send" })).toHaveAttribute("href", EXPAND);
  });
});
