import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";
import type { FormState } from "@/app/admin/jobs/actions";

const moveStage = vi.fn(async () => {});
const saveNote = vi.fn(async () => ({ error: "Write a note first" }));
const saveDetails = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({ ok: true }));
vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage, saveNote, saveDetails,
  markLost: vi.fn(async () => ({})),
  sendPortalInviteNow: vi.fn(),
}));

const { StageControls } = await import("@/app/admin/jobs/[id]/StageControls");
const { NoteForm } = await import("@/app/admin/jobs/[id]/NoteForm");
const { DetailsForm } = await import("@/app/admin/jobs/[id]/DetailsForm");

const job: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Dana Reyes",
  phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [], windowCount: null,
  heardVia: null, notes: null, source: "phone", status: "quoted", stageChangedAt: new Date(),
  visitAt: null, quoteCents: 450000, soldCents: null, depositCents: null, brands: ["Hunter Douglas"],
  orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};

describe("job page", () => {
  it("offers the next stage as the main button", () => {
    render(<StageControls job={job} />);
    expect(screen.getByRole("button", { name: "Move to Sold" })).toBeInTheDocument();
  });

  it("offers no next step once a job is installed", () => {
    render(<StageControls job={{ ...job, status: "installed" }} />);
    expect(screen.queryByRole("button", { name: /^Move to/ })).toBeNull();
  });

  it("shows a note validation error inline", async () => {
    const user = userEvent.setup();
    render(<NoteForm jobId={job.id} />);
    await user.click(screen.getByRole("button", { name: /add note/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Write a note first");
  });

  it("prefills saved details as dollars and checked brands", () => {
    render(<DetailsForm job={job} />);
    expect(screen.getByLabelText(/quote/i)).toHaveValue("4500.00");
    expect(screen.getByRole("checkbox", { name: "Hunter Douglas" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alta Window Fashions" })).not.toBeChecked();
  });

  it("keeps typed values on the details form after a failed save", async () => {
    saveDetails.mockResolvedValueOnce({
      error: "Enter an amount under $21,474,836",
      values: { quote: "999999999", installOn: "2027-03-01" },
    });
    const user = userEvent.setup();
    render(<DetailsForm job={job} />);

    const quote = screen.getByLabelText(/quote/i);
    await user.clear(quote);
    await user.type(quote, "999999999");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/under \$21,474,836/);
    expect(screen.getByLabelText(/quote/i)).toHaveValue("999999999");
    expect(screen.getByLabelText(/install date/i)).toHaveValue("2027-03-01");
  });

  it("makes the next-stage button full width with a decorative icon", () => {
    render(<StageControls job={job} />);
    const button = screen.getByRole("button", { name: "Move to Sold" });
    expect(button.className).toContain("w-full");
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
