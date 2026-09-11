import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const moveStage = vi.fn(async () => {});
const saveNote = vi.fn(async () => ({ error: "Write a note first" }));
vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage, saveNote,
  markLost: vi.fn(async () => ({})), saveDetails: vi.fn(async () => ({ ok: true })),
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
});
