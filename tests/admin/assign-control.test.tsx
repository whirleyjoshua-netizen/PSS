import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const assignJobAction = vi.fn();
vi.mock("@/app/admin/jobs/actions", () => ({ assignJobAction }));

beforeEach(() => {
  assignJobAction.mockReset().mockResolvedValue({});
});

const { AssignControl } = await import("@/app/admin/jobs/[id]/AssignControl");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("AssignControl", () => {
  const team = [
    { id: "a", name: "Joshua", role: "installer" as const },
    { id: "b", name: "Shade", role: "designer" as const },
  ];

  it("offers Unassigned then each person with their tag, and shows the current choice", () => {
    render(<AssignControl jobId={ID} assignedTo="b" team={team} />);
    const select = screen.getByLabelText("Assigned to");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Unassigned", "Joshua — Installer", "Shade — Designer",
    ]);
    expect(select).toHaveValue("b");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("shows Unassigned when nobody is assigned", () => {
    render(<AssignControl jobId={ID} assignedTo={null} team={team} />);
    expect(screen.getByLabelText("Assigned to")).toHaveValue("");
  });

  it("reports a failed assign and goes back to who the job is really assigned to", async () => {
    assignJobAction.mockResolvedValue({ error: "That person is no longer on the team." });
    render(<AssignControl jobId={ID} assignedTo="b" team={team} />);
    await userEvent.selectOptions(screen.getByLabelText("Assigned to"), "a");
    expect(await screen.findByRole("alert")).toHaveTextContent("That person is no longer on the team.");
    // The pick never saved, so the control must not keep showing it.
    expect(screen.getByLabelText("Assigned to")).toHaveValue("b");
  });

  it("points to Settings when there is no team yet", () => {
    render(<AssignControl jobId={ID} assignedTo={null} team={[]} />);
    expect(screen.queryByLabelText("Assigned to")).toBeNull();
    expect(screen.getByRole("link", { name: "Add people in Settings" })).toHaveAttribute("href", "/admin/settings");
  });
});
