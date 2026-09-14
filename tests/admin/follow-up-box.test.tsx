import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/admin/jobs/follow-up-actions", () => ({ saveFollowUp: vi.fn(), clearFollowUpAction: vi.fn() }));
const { saveFollowUp } = await import("@/app/admin/jobs/follow-up-actions");
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
  it("discards edits on Cancel when there was no saved call-back", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: null, followUpNote: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Set call-back" }));
    fireEvent.click(screen.getByRole("button", { name: "Next week 10 AM" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "typed reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Set call-back" }));
    expect((screen.getByLabelText("Call-back date and time") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("");
  });
  it("discards edits on Cancel and restores the saved call-back", () => {
    render(
      <FollowUpBox job={{ id: JOB, followUpAt: new Date("2099-10-16T17:00:00Z"), followUpNote: "checking with husband" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const savedAt = (screen.getByLabelText("Call-back date and time") as HTMLInputElement).value;
    fireEvent.click(screen.getByRole("button", { name: "Next week 10 AM" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "typed reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect((screen.getByLabelText("Call-back date and time") as HTMLInputElement).value).toBe(savedAt);
    expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("checking with husband");
  });

  it("closes the editor after a successful save even when only the reason changed", async () => {
    vi.mocked(saveFollowUp).mockResolvedValue({ ok: true });
    render(
      <FollowUpBox job={{ id: JOB, followUpAt: new Date("2099-10-16T17:00:00Z"), followUpNote: "checking with husband" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "new reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Save call-back" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument());
    expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();
  });

  it("does not show a stale error or typed reason after Cancel then reopening", async () => {
    vi.mocked(saveFollowUp).mockResolvedValue({ error: "Pick a valid call-back date and time", values: { at: "bad", note: "typed reason" } });
    render(<FollowUpBox job={{ id: JOB, followUpAt: null, followUpNote: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Set call-back" }));
    fireEvent.click(screen.getByRole("button", { name: "Next week 10 AM" }));
    fireEvent.click(screen.getByRole("button", { name: "Save call-back" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Set call-back" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("");
  });
});
