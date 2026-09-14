import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/admin/jobs/follow-up-actions", () => ({ saveFollowUp: vi.fn(), clearFollowUpAction: vi.fn() }));
const { FollowUpBox } = await import("@/app/admin/jobs/[id]/FollowUpBox");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("FollowUpBox", () => {
  it("says when none is set and offers Set", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: null, followUpNote: null }} />);
    expect(screen.getByText("No call-back set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set call-back" })).toBeInTheDocument();
  });
  it("shows the next call-back with Change and Done", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: new Date("2099-10-16T17:00:00Z"), followUpNote: "checking with husband" }} />);
    expect(screen.getByText(/Next call-back: .* · checking with husband/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
  it("marks an overdue call-back", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: new Date("2020-01-01T17:00:00Z"), followUpNote: null }} />);
    expect(screen.getByText(/Overdue/).className).toContain("text-overdue");
  });
  it("opens an editor with quick picks", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: null, followUpNote: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Set call-back" }));
    expect(screen.getByLabelText("Call-back date and time")).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Next week 10 AM" }));
    expect((screen.getByLabelText("Call-back date and time") as HTMLInputElement).value).toMatch(/T10:00$/);
    expect(screen.getByRole("button", { name: "Save call-back" })).toBeInTheDocument();
  });
});
