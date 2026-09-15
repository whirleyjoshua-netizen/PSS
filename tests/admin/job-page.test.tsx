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

  it("prefills saved details as dollars and checked brands", () => {
    render(<DetailsForm job={job} />);
    expect(screen.getByLabelText(/quote/i)).toHaveValue("4500.00");
    expect(screen.getByRole("checkbox", { name: "Hunter Douglas" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alta Window Fashions" })).not.toBeChecked();
  });

  it("records the dates the details form was rendered with, in the visible inputs' formats", () => {
    const { container } = render(
      <DetailsForm job={{ ...job, visitAt: new Date("2026-09-20T17:00:00Z"), installOn: "2027-01-10" }} />,
    );
    const hidden = (name: string) => container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
    expect(hidden("visitAtLoaded")?.value).toBe("2026-09-20T10:00");
    expect(hidden("installOnLoaded")?.value).toBe("2027-01-10");
    expect(screen.getByLabelText(/visit date and time/i)).toHaveValue("2026-09-20T10:00");
  });

  it("records empty loaded dates for a job with none", () => {
    const { container } = render(<DetailsForm job={job} />);
    expect(container.querySelector<HTMLInputElement>('input[name="visitAtLoaded"]')?.value).toBe("");
    expect(container.querySelector<HTMLInputElement>('input[name="installOnLoaded"]')?.value).toBe("");
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
    // The loaded value stays what the form was rendered with, so the typed date still counts as an edit.
    expect(document.querySelector<HTMLInputElement>('input[name="installOnLoaded"]')?.value).toBe("");
  });

  it("shows the budget tier in the details form", () => {
    render(<DetailsForm job={{ ...job, budgetTier: "mid" }} />);
    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByLabelText("Budget")).toHaveValue("mid");
  });

  it("makes the move-to-next-stage button full width with a decorative icon", () => {
    render(<StageControls job={job} />);
    const button = screen.getByRole("button", { name: "Move to Sold" });
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
    expect(screen.getByRole("button", { name: "Move to Sold" })).toBeInTheDocument();
    expect(screen.getByLabelText("Set stage")).toBeInTheDocument();
  });
});
