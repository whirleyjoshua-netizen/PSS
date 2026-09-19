import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveLeadDefaultsAction = vi.fn();
vi.mock("@/app/admin/settings/actions", () => ({ saveLeadDefaultsAction }));
const { LeadDefaultsSection } = await import("@/app/admin/settings/LeadDefaultsSection");

const SHADE = { id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Shade Momodu", role: "designer" as const };
const LUIS = { id: "9a1c1d2e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Luis Ortega", role: "installer" as const };

beforeEach(() => saveLeadDefaultsAction.mockReset());

describe("lead defaults section", () => {
  it("lists Nobody and every team member, with the saved default selected", () => {
    render(<LeadDefaultsSection team={[SHADE, LUIS]} defaultAssignee={SHADE.id} />);
    const select = screen.getByLabelText("Default for new leads");
    expect(select).toHaveAttribute("name", "defaultAssignee");
    expect(select).toHaveValue(SHADE.id);
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => [o.getAttribute("value"), o.textContent])).toEqual([
      ["", "Nobody"],
      [SHADE.id, "Shade Momodu — Designer"],
      [LUIS.id, "Luis Ortega — Installer"],
    ]);
  });

  it("selects Nobody when no default is set", () => {
    render(<LeadDefaultsSection team={[SHADE]} defaultAssignee={null} />);
    expect(screen.getByLabelText("Default for new leads")).toHaveValue("");
  });

  it("shows the problem when saving fails, then Saved. when it works", async () => {
    saveLeadDefaultsAction
      .mockResolvedValueOnce({ error: "That person is no longer on the team" })
      .mockResolvedValueOnce({ ok: true });
    render(<LeadDefaultsSection team={[SHADE]} defaultAssignee={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Save default" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That person is no longer on the team");
    fireEvent.click(screen.getByRole("button", { name: "Save default" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });
});
