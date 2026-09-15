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
    addMember.mockResolvedValue({ error: "Enter a name", name: "" });
    render(<AddMemberForm />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name");
  });
});
