import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The action module is a server action file that reaches server-only code, so it is mocked
 * away: this test is about what the customer sees and what a no-JS post would carry.
 */
vi.mock("@/app/(site)/project/actions", () => ({ approveQuoteFormAction: vi.fn() }));

const { ApproveQuote } = await import("@/app/(site)/project/ApproveQuote");
const { StatusBanner } = await import("@/app/(site)/project/StatusBanner");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const REVEAL = "Approving tells us to go ahead and order. We will email you to arrange the details.";

const quoteStep = {
  key: "quote" as const,
  label: "Your quote is ready",
  state: "current" as const,
  reached: true,
  on: "Sep 13",
  future: false,
};

describe("ApproveQuote", () => {
  it("offers a closed disclosure headed 'Approve this quote'", () => {
    render(<ApproveQuote jobId={JOB} />);
    expect(screen.getByText("Approve this quote")).toBeInTheDocument();
    // Closed by default: approving is deliberate, never one stray tap.
    expect(document.querySelector("details")).not.toHaveAttribute("open");
  });

  it("explains what approving means before asking them to confirm", () => {
    render(<ApproveQuote jobId={JOB} />);
    expect(screen.getByText(REVEAL)).toBeInTheDocument();
  });

  it("works with JavaScript off: a plain form post carrying the job id", () => {
    render(<ApproveQuote jobId={JOB} />);
    // <details> reveals without script, and the hidden field tells the action the job.
    expect(document.querySelector("details")).toBeInTheDocument();
    expect(document.querySelector("form")).toBeInTheDocument();
    expect(document.querySelector('input[name="jobId"]')).toHaveValue(JOB);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});

describe("StatusBanner", () => {
  it("shows the approve control beside the Review quote link", () => {
    render(
      <StatusBanner step={quoteStep} quoteHref={`/project/files/${JOB}`} approve={<ApproveQuote jobId={JOB} />} />,
    );
    expect(screen.getByRole("link", { name: "Review quote" })).toBeInTheDocument();
    expect(screen.getByText("Approve this quote")).toBeInTheDocument();
  });

  it("shows no approve control when none is passed", () => {
    render(<StatusBanner step={quoteStep} quoteHref={`/project/files/${JOB}`} approve={null} />);
    expect(screen.getByRole("link", { name: "Review quote" })).toBeInTheDocument();
    expect(screen.queryByText("Approve this quote")).not.toBeInTheDocument();
  });
});
