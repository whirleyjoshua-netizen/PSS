import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const addJob = vi.fn(async () => ({
  error: "Enter a valid phone number",
  values: { name: "Dana Reyes", phone: "abc", city: "Henderson", source: "phone", notes: "Wants motorized" },
}));
vi.mock("@/app/admin/jobs/actions", () => ({ addJob }));

const { NewJobForm } = await import("@/app/admin/jobs/new/NewJobForm");

describe("NewJobForm", () => {
  it("keeps typed values after a failed submit", async () => {
    const user = userEvent.setup();
    render(<NewJobForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Dana Reyes");
    await user.type(screen.getByLabelText(/^phone$/i), "abc");
    await user.type(screen.getByLabelText(/notes/i), "Wants motorized");
    await user.click(screen.getByRole("button", { name: /add job/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid phone/i);
    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Dana Reyes");
    expect(screen.getByLabelText(/^phone$/i)).toHaveValue("abc");
    expect(screen.getByLabelText(/notes/i)).toHaveValue("Wants motorized");
  });

  it("offers a stage picker, pre-set from the column the owner came from", () => {
    render(<NewJobForm defaultStage="quoted" />);
    expect(screen.getByLabelText("Stage")).toHaveValue("quoted");
  });

  it("defaults the stage to a new lead", () => {
    render(<NewJobForm />);
    expect(screen.getByLabelText("Stage")).toHaveValue("new");
  });
});
