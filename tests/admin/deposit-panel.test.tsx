import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordDepositAction = vi.fn();
const cancelDepositAction = vi.fn();
vi.mock("@/app/admin/jobs/[id]/deposit-actions", () => ({ recordDepositAction, cancelDepositAction }));
const { DepositPanel } = await import("@/app/admin/jobs/[id]/DepositPanel");

const J = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const view = {
  jobStatus: "signed", amountCents: 92417, soldCents: 184833, lastCancellableDay: "2026-10-01", inWindow: true,
  paid: null, refunded: null, cardPending: false,
};
const paid = { id: "d1", amountCents: 92417, method: "stripe" as const, paidAt: new Date("2026-09-29T17:00:00Z") };

beforeEach(() => {
  recordDepositAction.mockReset().mockResolvedValue({ ok: true });
  cancelDepositAction.mockReset().mockResolvedValue({ ok: true });
});

describe("DepositPanel", () => {
  it("shows the deposit due and records a payment with the amount prefilled", async () => {
    render(<DepositPanel jobId={J} view={view} />);
    expect(screen.getByText("50% deposit due: $924.17 of $1,848.33.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Payment received" }));
    expect(screen.getByLabelText("Deposit received")).toHaveValue("924.17");
    fireEvent.change(screen.getByLabelText("Paid by"), { target: { value: "cash" } });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Deposit recorded. The job is Sold.");
    expect(recordDepositAction).toHaveBeenCalledWith(J, "924.17", "cash");
  });

  it("shows the action's refusal", async () => {
    recordDepositAction.mockResolvedValueOnce({ error: "The client is paying by card right now. Wait for that payment before recording another." });
    render(<DepositPanel jobId={J} view={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Payment received" }));
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The client is paying by card right now.");
  });

  it("confirms Cancel & refund, saying whether the 3-day window is open", async () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "sold", paid }} />);
    expect(screen.getByText("Deposit $924.17 paid by card on Sep 29, 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Payment received" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel & refund" }));
    expect(screen.getByText("The client is inside the 3-business-day cancellation window, which ends at the end of Oct 1, 2026.")).toBeInTheDocument();
    expect(screen.getByText(/refunds \$924\.17 to the client's card in full/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel and refund" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Cancelled and refunded. The job is Lost.");
    expect(cancelDepositAction).toHaveBeenCalledWith(J, "d1");
  });

  it("says when the window has closed, and words a recorded deposit as one to return", () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "sold", inWindow: false, paid: { ...paid, method: "check" } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel & refund" }));
    expect(screen.getByText("The 3-business-day cancellation window closed at the end of Oct 1, 2026.")).toBeInTheDocument();
    expect(screen.getByText(/return it to the client yourself/)).toBeInTheDocument();
  });

  it("offers nothing on a refunded, Lost job", () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "lost", refunded: { amountCents: 92417, refundedAt: new Date("2026-09-30T17:00:00Z") } }} />);
    expect(screen.getByText("Deposit $924.17 refunded Sep 30, 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
