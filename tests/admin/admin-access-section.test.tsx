import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const giveAccess = vi.fn();
const removeAccess = vi.fn();
vi.mock("@/app/admin/settings/actions", () => ({ giveAccess, removeAccess }));

const { AdminAccessSection } = await import("@/app/admin/settings/AdminAccessSection");

const added = [
  { email: "alia@example.com", addedBy: "owner@example.com", addedAt: new Date("2026-09-28T18:00:00Z") },
  { email: "me@example.com", addedBy: "owner@example.com", addedAt: new Date("2026-09-28T19:00:00Z") },
];

beforeEach(() => {
  giveAccess.mockReset();
  removeAccess.mockReset();
});

describe("admin access section", () => {
  it("shows owners with no Remove button", () => {
    render(<AdminAccessSection owners={["owner@example.com"]} added={[]} me="owner@example.com" />);
    const region = screen.getByRole("region", { name: "Admin access" });
    const owner = within(region).getByText("owner@example.com").closest("li")!;
    expect(owner).toHaveTextContent("Owner");
    expect(within(owner).queryByRole("button")).toBeNull();
  });

  it("offers Remove for added admins but not for yourself", () => {
    render(<AdminAccessSection owners={["owner@example.com"]} added={added} me="me@example.com" />);
    expect(screen.getByRole("button", { name: "Remove alia@example.com" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove me@example.com" })).toBeNull();
    expect(screen.getByText("me@example.com").closest("li")).toHaveTextContent("That's you");
    expect(screen.getByText("alia@example.com").closest("li")).toHaveTextContent("added by owner@example.com");
  });

  it("shows the result of giving access", async () => {
    giveAccess.mockResolvedValue({ ok: "Access given to new@example.com. We emailed them the sign-in link." });
    render(<AdminAccessSection owners={[]} added={[]} me="owner@example.com" />);
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Access given to new@example.com.");
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("shows a problem and keeps what was typed", async () => {
    giveAccess.mockResolvedValue({ error: "That address is already an owner.", email: "Owner@example.com" });
    render(<AdminAccessSection owners={[]} added={[]} me="owner@example.com" />);
    await userEvent.type(screen.getByLabelText("Email"), "Owner@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That address is already an owner.");
    expect(screen.getByLabelText("Email")).toHaveValue("Owner@example.com");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
