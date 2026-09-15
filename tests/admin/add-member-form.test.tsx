import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const addMember = vi.fn();
vi.mock("@/app/admin/settings/actions", () => ({ addMember }));

const { AddMemberForm } = await import("@/app/admin/settings/AddMemberForm");

beforeEach(() => {
  addMember.mockReset();
});

describe("add member form", () => {
  it("shows the problem from the action and keeps the typed name", async () => {
    addMember.mockResolvedValue({ error: "Enter a name", name: "  " });
    render(<AddMemberForm />);
    // Spaces get past the browser's own required check, so the action's message is what shows.
    await userEvent.type(screen.getByLabelText("Name"), "  ");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name");
    expect(screen.getByLabelText("Name")).toHaveValue("  ");
  });

  it("ties the Name box to the problem it caused", async () => {
    addMember.mockResolvedValue({ error: "Enter a name", name: "  " });
    render(<AddMemberForm />);
    const name = screen.getByLabelText("Name");
    expect(name).toBeRequired();
    expect(name).not.toHaveAttribute("aria-invalid");
    await userEvent.type(name, "  ");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    const alert = await screen.findByRole("alert");
    const invalid = screen.getByLabelText("Name");
    expect(invalid).toHaveAttribute("aria-invalid", "true");
    expect(invalid).toHaveAttribute("aria-describedby", alert.id);
    expect(alert.id).not.toBe("");
  });

  it("clears the Name box after a member is added", async () => {
    addMember.mockResolvedValue({ ok: true });
    render(<AddMemberForm />);
    await userEvent.type(screen.getByLabelText("Name"), "Shade");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});
