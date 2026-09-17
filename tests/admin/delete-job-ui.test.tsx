import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/jobs/actions", () => ({ deleteJobAction: vi.fn(async () => {}) }));
const { DeleteJob } = await import("@/app/admin/jobs/[id]/DeleteJob");
const { isDeleteBlocked } = await import("@/app/admin/jobs/[id]/tabs");

describe("the ?delete= marker", () => {
  it("recognises the one value it knows", () => {
    expect(isDeleteBlocked("blocked")).toBe(true);
    expect(isDeleteBlocked(["blocked"])).toBe(true);
  });

  it("is never anything but a known value — a crafted link says nothing", () => {
    for (const crafted of [
      undefined, "", "Blocked", "yes", "Your account has been suspended. Call 702-555-0100.",
      "<script>alert(1)</script>", "blocked ", ["nope", "blocked"],
    ]) expect(isDeleteBlocked(crafted)).toBe(false);
  });
});

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job = { id: ID, name: "Maria Alvarez", projectNo: "PSS-1002" };

describe("DeleteJob", () => {
  it("names the customer before it will delete anything", () => {
    render(<DeleteJob job={job} />);
    expect(screen.getByText(/Maria Alvarez/)).toBeInTheDocument();
    expect(screen.getByText(/PSS-1002/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("spells out everything that goes with the job", () => {
    render(<DeleteJob job={job} />);
    expect(screen.getByText(/the quote, measurements, photos, documents and history/)).toBeInTheDocument();
  });

  it("still reads as a sentence when the job has no project number", () => {
    render(<DeleteJob job={{ ...job, projectNo: null }} />);
    expect(screen.getByText(/Deleting removes/)).toBeInTheDocument();
    expect(screen.queryByText(/PSS-/)).toBeNull();
    expect(screen.queryByText(/, ,/)).toBeNull();
  });

  it("hides the warning behind a details reveal, so no JavaScript is needed", () => {
    const { container } = render(<DeleteJob job={job} />);
    const details = container.querySelector("details")!;
    expect(within(details).getByText("Delete this job…")).toBeInTheDocument();
    expect(details.open).toBe(false);
  });

  it("submits with a plain form post, not a click handler", () => {
    const { container } = render(<DeleteJob job={job} />);
    const form = container.querySelector("form")!;
    expect(form).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Delete" })).toHaveAttribute("type", "submit");
  });

  it("says nothing about a service request until one blocks the delete", () => {
    render(<DeleteJob job={job} />);
    expect(screen.queryByText(/service request/i)).toBeNull();
  });

  it("explains what to do when a service request blocks the delete, with the panel already open", () => {
    const { container } = render(<DeleteJob job={job} blocked />);
    expect(screen.getByText("This job has a service request against it. Delete that first.")).toBeInTheDocument();
    expect(container.querySelector("details")!.open).toBe(true);
  });
});
