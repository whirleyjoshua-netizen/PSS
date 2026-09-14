import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/admin/jobs/call-actions", () => ({ logCallAction: vi.fn() }));
const { CallForm } = await import("@/app/admin/jobs/[id]/call/CallForm");

const job = { id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", treatments: ["Shades"], windowCount: "6-10", budgetTier: "mid" as const, visitAt: null };

describe("CallForm", () => {
  it("is pre-filled from the job", () => {
    render(<CallForm job={job} />);
    expect(screen.getByLabelText("Shades")).toBeChecked();
    expect(screen.getByLabelText("Shutters")).not.toBeChecked();
    expect(screen.getByLabelText("6-10")).toBeChecked();
    expect(screen.getByLabelText("Mid-range")).toBeChecked();
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });

  it("offers talked and no answer as direct saves", () => {
    render(<CallForm job={job} />);
    expect(screen.getByRole("button", { name: "Talked, no visit yet" })).toHaveAttribute("value", "talked");
    expect(screen.getByRole("button", { name: "No answer" })).toHaveAttribute("value", "no_answer");
  });

  it("asks for the visit time before saving a booked visit", () => {
    render(<CallForm job={job} />);
    expect(screen.queryByLabelText("Visit date and time")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Booked a visit" }));
    expect(screen.getByLabelText("Visit date and time")).toBeRequired();
    expect(screen.getByRole("button", { name: "Save booked visit" })).toHaveAttribute("value", "booked");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Visit date and time")).toBeNull();
  });
});
