import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const setKeptOfficialAction = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/admin/jobs/measure-actions", () => ({ setKeptOfficialAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { KeepOfficialBox } = await import("@/app/admin/jobs/[id]/KeepOfficialBox");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  setKeptOfficialAction.mockReset().mockResolvedValue({});
  refresh.mockReset();
});

describe("KeepOfficialBox", () => {
  it("ticks keep-as-official and refreshes", async () => {
    render(<KeepOfficialBox jobId={JOB} kept={false} blocked={false} />);
    fireEvent.click(screen.getByLabelText("Keep as official measure"));
    await waitFor(() => expect(setKeptOfficialAction).toHaveBeenCalledWith(JOB, true));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("unticks when kept", async () => {
    render(<KeepOfficialBox jobId={JOB} kept={true} blocked={false} />);
    expect(screen.getByLabelText("Keep as official measure")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Keep as official measure"));
    await waitFor(() => expect(setKeptOfficialAction).toHaveBeenCalledWith(JOB, false));
  });

  it("cannot be ticked once an official measure exists, and says why", () => {
    render(<KeepOfficialBox jobId={JOB} kept={false} blocked={true} />);
    expect(screen.getByLabelText("Keep as official measure")).toBeDisabled();
    expect(screen.getByText("An official measure is already recorded.")).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    setKeptOfficialAction.mockResolvedValue({ error: "An official measure is already recorded, so the designer measure can’t be kept as official." });
    render(<KeepOfficialBox jobId={JOB} kept={false} blocked={false} />);
    fireEvent.click(screen.getByLabelText("Keep as official measure"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("can’t be kept as official");
    expect(alert).toHaveClass("text-overdue");
    // The screen must equal what's saved: once the action settles, the refused tick has snapped back.
    await waitFor(() => expect(screen.getByLabelText("Keep as official measure")).toBeEnabled());
    expect(screen.getByLabelText("Keep as official measure")).not.toBeChecked();
  });

  it("after a refusal and refresh, says why once (the static line, not the alert too)", async () => {
    setKeptOfficialAction.mockResolvedValue({ error: "An official measure is already recorded, so the designer measure can’t be kept as official." });
    const { rerender } = render(<KeepOfficialBox jobId={JOB} kept={false} blocked={false} />);
    fireEvent.click(screen.getByLabelText("Keep as official measure"));
    await screen.findByRole("alert");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // router.refresh() brings the official window the server saw: the box is now blocked.
    rerender(<KeepOfficialBox jobId={JOB} kept={false} blocked={true} />);
    expect(screen.getByText("An official measure is already recorded.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
