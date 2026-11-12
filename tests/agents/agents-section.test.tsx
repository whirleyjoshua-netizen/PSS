import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = {
  addSuppressionAction: vi.fn(async () => ({})),
  removeSuppressionAction: vi.fn(),
};
vi.mock("@/app/admin/settings/agent-actions", () => actions);

const { DoNotContactSection } = await import("@/app/admin/settings/AgentsSection");

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockClear();
});

describe("do-not-contact section", () => {
  it("is headed Do not contact, with no agent setup left", () => {
    render(<DoNotContactSection suppressions={[]} />);
    expect(screen.getByRole("heading", { name: "Do not contact" })).toBeInTheDocument();
    expect(screen.queryByText(/agent/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /key/i })).toBeNull();
  });

  it("says the do-not-contact list is empty", () => {
    render(<DoNotContactSection suppressions={[]} />);
    expect(screen.getByText("No one is on the do-not-contact list.")).toBeInTheDocument();
  });

  it("lists do-not-contact addresses with Remove, and offers to add one", () => {
    const suppressions = [{ address: "bob@example.com", reason: null, source: "link", createdAt: new Date("2026-10-01T18:00:00Z") }];
    render(<DoNotContactSection suppressions={suppressions} />);
    expect(screen.getByRole("button", { name: "Remove bob@example.com" })).toBeInTheDocument();
    expect(screen.getByText(/Unsubscribed/)).toBeInTheDocument();
    expect(screen.getByLabelText("Address to block")).toBeInTheDocument();
  });
});
