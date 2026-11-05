import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordDepositAction = vi.fn();
const cancelDepositAction = vi.fn();
const emailPayLinkAction = vi.fn();
vi.mock("@/app/admin/jobs/[id]/deposit-actions", () => ({ recordDepositAction, cancelDepositAction, emailPayLinkAction }));
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
  emailPayLinkAction.mockReset().mockResolvedValue({ ok: true });
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

  it("offers Cancel & refund on a job still Signed with a paid deposit, and keeps both choices locked while it runs", async () => {
    let finish: (value: { ok: true }) => void = () => {};
    cancelDepositAction.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "signed", paid: { ...paid, method: "cash" } }} />);
    expect(screen.queryByRole("button", { name: "Payment received" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel & refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel and refund" }));
    expect(await screen.findByRole("button", { name: "Keep the order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Yes, cancel and refund" })).toBeDisabled();
    finish({ ok: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Cancelled and refunded. The job is Lost.");
    expect(cancelDepositAction).toHaveBeenCalledWith(J, "d1");
  });

  it("keeps Keep waiting locked while a payment is being recorded", async () => {
    let finish: (value: { ok: true }) => void = () => {};
    recordDepositAction.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    render(<DepositPanel jobId={J} view={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Payment received" }));
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByRole("button", { name: "Keep waiting" })).toBeDisabled();
    finish({ ok: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Deposit recorded. The job is Sold.");
  });

  it("says when the window has closed, and words a recorded deposit as one to return", () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "sold", inWindow: false, paid: { ...paid, method: "check" } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel & refund" }));
    expect(screen.getByText("The 3-business-day cancellation window closed at the end of Oct 1, 2026.")).toBeInTheDocument();
    expect(screen.getByText(/return it to the client yourself/)).toBeInTheDocument();
  });

  // Ruling P21: any stage before Ordered, and Lost, while a paid deposit exists.
  it.each(["measure", "lost"])("offers Cancel & refund on a %s job with a paid deposit, and still says whether the window is open", (jobStatus) => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus, inWindow: false, paid }} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel & refund" }));
    expect(screen.getByText("The 3-business-day cancellation window closed at the end of Oct 1, 2026.")).toBeInTheDocument();
  });

  it("offers no Cancel & refund once the job is Ordered", () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "ordered", paid }} />);
    expect(screen.getByText("Deposit $924.17 paid by card on Sep 29, 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers nothing on a refunded, Lost job", () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "lost", refunded: { amountCents: 92417, refundedAt: new Date("2026-09-30T17:00:00Z") } }} />);
    expect(screen.getByText("Deposit $924.17 refunded Sep 30, 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("DepositPanel card payment link (owner 2026-11-04)", () => {
  const URL = "https://pss.test/pay/x/abcdefghijklmnopqrstuv";
  const linked = { ...view, payUrl: URL, hasEmail: true };

  it("offers the link to copy, email, or open to take a card by phone", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DepositPanel jobId={J} view={linked} />);
    expect(screen.getByText(URL)).toBeInTheDocument();
    const phone = screen.getByRole("link", { name: "Take card by phone" });
    expect(phone).toHaveAttribute("href", URL);
    expect(phone).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Link copied.");
    expect(writeText).toHaveBeenCalledWith(URL);
    fireEvent.click(screen.getByRole("button", { name: "Email link to client" }));
    expect(await screen.findByText("Payment link emailed to the client.")).toBeInTheDocument();
    expect(emailPayLinkAction).toHaveBeenCalledWith(J);
  });

  it("shows the email's error", async () => {
    emailPayLinkAction.mockResolvedValue({ error: "The email didn't send. Try again, or copy the link and text it." });
    render(<DepositPanel jobId={J} view={linked} />);
    fireEvent.click(screen.getByRole("button", { name: "Email link to client" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The email didn't send.");
  });

  it("has no email button without an email, and says to text the link", () => {
    render(<DepositPanel jobId={J} view={{ ...linked, hasEmail: false }} />);
    expect(screen.queryByRole("button", { name: "Email link to client" })).toBeNull();
    expect(screen.getByText(/No email on this job/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("is gone once the deposit is paid, before the contract is signed, and when cards aren't set up", () => {
    const { unmount } = render(<DepositPanel jobId={J} view={{ ...linked, paid }} />);
    expect(screen.queryByRole("link", { name: "Take card by phone" })).toBeNull();
    unmount();
    const second = render(<DepositPanel jobId={J} view={{ ...linked, jobStatus: "sold" }} />);
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    second.unmount();
    render(<DepositPanel jobId={J} view={{ ...linked, payUrl: null }} />);
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });
});
