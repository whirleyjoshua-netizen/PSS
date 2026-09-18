import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { business } from "@/content/business";

/**
 * The action module is a server action file that reaches server-only code, so it is mocked
 * away: this test is about what the customer sees and what a no-JS post would carry.
 */
vi.mock("@/app/(site)/project/actions", () => ({ approveQuoteFormAction: vi.fn() }));

const { ApproveQuote, ApprovalNotice } = await import("@/app/(site)/project/ApproveQuote");
const { StatusBanner } = await import("@/app/(site)/project/StatusBanner");

const THANKS = "Thank you — we have your approval and will be in touch to arrange the details.";

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

/**
 * What the customer is told after they tap. The flag rides back on the URL, so it is the
 * customer's own browser talking: every sentence here is checked against the job's real status
 * before it is said.
 */
describe("ApprovalNotice", () => {
  it("confirms an approval the job agrees with", () => {
    render(<ApprovalNotice approved="1" status="sold" />);
    expect(screen.getByRole("status")).toHaveTextContent(THANKS);
  });

  it("says nothing on an ordinary visit", () => {
    render(<ApprovalNotice approved={null} status="sold" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  /**
   * The load-bearing one. `?approved=1` is a string anyone can type into their own address
   * bar. Approving a quote commits the owners to ordering materials, so a page that confirmed
   * an approval on the strength of the URL alone would tell a customer their order was placed
   * when nothing had happened. The job's own status is the only thing believed.
   */
  it("confirms nothing when the job is not sold, whatever the URL says", () => {
    for (const status of ["quoted", "ordered", "installed"] as const) {
      const { unmount } = render(<ApprovalNotice approved="1" status={status} />);
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText(THANKS)).toBeNull();
      unmount();
    }
  });

  it("tells a customer whose approval was refused how to reach us", () => {
    render(<ApprovalNotice approved="no" status="quoted" />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("We could not record that approval just now.");
    // The number comes from the one place it lives, so it can never go stale on this page.
    expect(notice).toHaveTextContent(business.phone.display);
  });

  /**
   * I1. The refusal must be re-derived too, not just the confirmation.
   *
   * `?approved=` is the customer's own URL, and anything that is not "1" currently prints the
   * failure line — including on a job that is already sold. A customer who taps back after a
   * refused attempt, or opens a stale or forwarded link, is then told their approval failed on
   * a job the owners have already ordered against. They phone; the owners cannot see what they
   * are describing. When the job's own status says the approval happened, there is no true
   * refusal to report, so the notice says nothing.
   */
  /**
   * F1: every status AT OR BEYOND `sold`, not `sold` alone.
   *
   * An approval that landed does not stay at `sold` — the owners order, install and complete the
   * job. A stale or forwarded `?approved=no` revisited after the job moved on would otherwise
   * tell the customer their approval failed on a job that is demonstrably past it, which is the
   * same lie I1 named, just later. `completed` reaches this component folded to `installed`, so
   * covering `installed` covers it.
   */
  it.each(["sold", "ordered", "installed"] as const)(
    "says nothing about a failure once the job is %s, whatever the URL says",
    (status) => {
      for (const approved of ["no", "0", "", "anything"]) {
        const { unmount } = render(<ApprovalNotice approved={approved} status={status} />);
        expect(screen.queryByText(/could not record that approval/i)).toBeNull();
        unmount();
      }
    },
  );

  // The refusal still speaks when the job agrees nothing was recorded — pinned by
  // "tells a customer whose approval was refused how to reach us" above, which renders the
  // same `approved="no"` against a `quoted` job and would fail if this fix over-suppressed.

  // Renamed: this static-renders a component with no interactivity, so it cannot go red for a
  // no-JS regression. What it really pins is that the sentence needs no client boundary — the
  // actual no-JS guarantee is the plain <form>/<details>, covered by the e2e.
  it("renders its sentence server-side, with no client boundary", () => {
    expect(renderToStaticMarkup(<ApprovalNotice approved="1" status="sold" />)).toContain(THANKS);
    expect(renderToStaticMarkup(<ApprovalNotice approved="no" status="quoted" />)).toContain(
      business.phone.display,
    );
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
