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
  assignJobAction: vi.fn(async () => ({})),
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
  budgetTier: null,
};

describe("job page", () => {
  it("offers Set stage as a control", () => {
    render(<StageControls job={job} />);
    expect(screen.getByLabelText("Set stage")).toBeInTheDocument();
  });

  it("offers Completed as the next step once a job is installed", () => {
    render(<StageControls job={{ ...job, status: "installed" }} />);
    expect(screen.getByRole("button", { name: /^Move to Completed/ })).toBeInTheDocument();
  });

  it("offers no next step once a job is completed", () => {
    render(<StageControls job={{ ...job, status: "completed" }} />);
    expect(screen.queryByRole("button", { name: /^Move to/ })).toBeNull();
  });

  it("shows a note validation error inline", async () => {
    const user = userEvent.setup();
    render(<NoteForm jobId={job.id} />);
    await user.click(screen.getByRole("button", { name: /add note/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Write a note first");
  });

  it("prefills saved details and checked brands", () => {
    render(<DetailsForm job={job} />);
    expect(screen.getByRole("checkbox", { name: "Hunter Douglas" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alta Window Fashions" })).not.toBeChecked();
  });

  it("keeps typed values on the details form after a failed save", async () => {
    saveDetails.mockResolvedValueOnce({
      error: "Pick a budget tier",
      values: { orderedOn: "2027-03-01" },
    });
    const user = userEvent.setup();
    render(<DetailsForm job={job} />);

    await user.type(screen.getByLabelText("Order date"), "2027-03-01");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a budget tier");
    expect(screen.getByLabelText("Order date")).toHaveValue("2027-03-01");
  });

  it("shows the budget tier in the details form", () => {
    render(<DetailsForm job={{ ...job, budgetTier: "mid" }} />);
    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByLabelText("Budget")).toHaveValue("mid");
  });

  it("makes the move-to-next-stage button full width with a decorative icon", () => {
    render(<StageControls job={job} />);
    const button = screen.getByRole("button", { name: "Move to Approved" });
    expect(button.className).toContain("w-full");
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders only the requested stage-control parts", () => {
    render(<StageControls job={job} parts={["set", "lost"]} />);
    expect(screen.queryByRole("button", { name: /^Move to/ })).toBeNull();
    expect(screen.queryByText("Stage:")).toBeNull();
    expect(screen.getByLabelText("Set stage")).toBeInTheDocument();
    expect(screen.getByLabelText(/mark lost/i)).toBeInTheDocument();
  });

  it("still renders every stage-control part by default, including the unused move button", () => {
    render(<StageControls job={job} />);
    expect(screen.getByText("Stage:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Approved" })).toBeInTheDocument();
    expect(screen.getByLabelText("Set stage")).toBeInTheDocument();
  });
});
