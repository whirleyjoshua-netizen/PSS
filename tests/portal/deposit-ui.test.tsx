import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { business } from "@/content/business";

vi.mock("@/app/(site)/project/deposit-actions", () => ({ startDepositFormAction: vi.fn() }));
const { DepositCard, DepositNotice } = await import("@/app/(site)/project/DepositCard");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("DepositCard", () => {
  it("offers the deposit with its amount and the last day to cancel, as a plain form post", () => {
    render(<DepositCard jobId={JOB} amountCents={92417} lastCancellableDay="2026-10-01" />);
    expect(screen.getByRole("button", { name: "Pay 50% deposit — $924.17" })).toHaveAttribute("type", "submit");
    expect(screen.getByText(/You may cancel until the end of Oct 1, 2026/)).toBeInTheDocument();
    expect(document.querySelector('input[type="hidden"][name="jobId"]')).toHaveValue(JOB);
  });
});

describe("DepositNotice", () => {
  it("says the payment is received only when a deposit is recorded paid", () => {
    const { unmount } = render(<DepositNotice flag="done" paid />);
    expect(screen.getByRole("status")).toHaveTextContent("Payment received — thank you.");
    unmount();
    render(<DepositNotice flag="done" paid={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Processing — we will email your receipt as soon as your payment is confirmed.");
  });
  it("gives a way forward when card payment is unavailable, and says nothing otherwise", () => {
    const { unmount } = render(<DepositNotice flag="unavailable" paid={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(business.phone.display);
    unmount();
    for (const flag of [null, "not-due", "not-found", "paid", "anything"]) {
      const view = render(<DepositNotice flag={flag} paid={false} />);
      expect(screen.queryByRole("status")).toBeNull();
      view.unmount();
    }
  });
});
