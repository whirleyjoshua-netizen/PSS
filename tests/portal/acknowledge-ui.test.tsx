import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { business } from "@/content/business";

/**
 * The action module is a server action file reaching server-only code, so it is mocked away:
 * this test is about what the customer sees and what a no-JS post would carry.
 */
vi.mock("@/app/(site)/project/actions", () => ({
  acknowledgeInstallFormAction: vi.fn(),
  approveQuoteFormAction: vi.fn(),
}));

const { AcknowledgeInstall, AcknowledgeNotice } = await import(
  "@/app/(site)/project/AcknowledgeInstall"
);
const { StatusBanner } = await import("@/app/(site)/project/StatusBanner");
const { isFromAcknowledgement, ACKNOWLEDGEMENT_MARKER } = await import(
  "@/lib/portal/acknowledgement"
);
const { PORTAL_STATUSES, stageRank } = await import("@/lib/portal/progress");
const { STAGES } = await import("@/lib/admin/stages");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const QUESTION = "Is everything how you wanted it?";
const THANKS = "Thank you for letting us know — we are glad it is right.";

const installedStep = {
  key: "installed" as const,
  label: "Installed",
  state: "current" as const,
  reached: true,
  on: "Oct 13",
  future: false,
};

describe("AcknowledgeInstall", () => {
  it("asks the question in the spec's own words", () => {
    render(<AcknowledgeInstall jobId={JOB} />);
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
  });

  /** Spec §5: two clearly different actions, not one button with a tick. */
  it("offers two clearly distinct answers", () => {
    render(<AcknowledgeInstall jobId={JOB} />);
    expect(screen.getByRole("button", { name: "Yes, everything looks great" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Something is not right" })).toBeInTheDocument();
  });

  it("works with JavaScript off: a plain form post carrying the job id", () => {
    render(<AcknowledgeInstall jobId={JOB} />);
    expect(document.querySelector("form")).toBeInTheDocument();
    expect(document.querySelector('input[name="jobId"]')).toHaveValue(JOB);
    expect(screen.getByRole("button", { name: "Yes, everything looks great" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  /**
   * The unhappy half is a plain link to the service form the customer already has, carrying
   * only a marker that this came from an acknowledgement. The marker names a route, not a
   * status: nothing about it can move a job.
   */
  it("sends the unhappy answer to the service form, marked as an acknowledgement", () => {
    render(<AcknowledgeInstall jobId={JOB} />);
    const link = screen.getByRole("link", { name: "Something is not right" });
    expect(link).toHaveAttribute("href", `/project/${JOB}/service?from=${ACKNOWLEDGEMENT_MARKER}`);
  });

  it("renders both answers without script", () => {
    const html = renderToStaticMarkup(<AcknowledgeInstall jobId={JOB} />);
    expect(html).toContain(QUESTION);
    expect(html).toContain("Yes, everything looks great");
    expect(html).toContain(`/project/${JOB}/service?from=${ACKNOWLEDGEMENT_MARKER}`);
  });
});

/**
 * The marker, matched the way `?delete=blocked` is matched on the admin side: compared against
 * one known value and passed on as a boolean. It is never rendered and never picks a status.
 */
describe("isFromAcknowledgement", () => {
  it("is true only for the one marker the acknowledgement link sets", () => {
    expect(isFromAcknowledgement(ACKNOWLEDGEMENT_MARKER)).toBe(true);
  });

  it("is false for anything else a browser might send", () => {
    for (const value of [undefined, "", "1", "true", "completed", "installed", "Acknowledgement"]) {
      expect(isFromAcknowledgement(value)).toBe(false);
    }
  });

  it("does not believe a repeated parameter smuggling the marker in second", () => {
    expect(isFromAcknowledgement(["something-else", ACKNOWLEDGEMENT_MARKER])).toBe(false);
  });

  it("reads the first value of a repeated parameter", () => {
    expect(isFromAcknowledgement([ACKNOWLEDGEMENT_MARKER, "x"])).toBe(true);
  });
});

/**
 * What the customer is told on the hop back. `?acknowledged=` is their own browser talking, so
 * every sentence is re-derived from the job's REAL status before it is said — the same rule
 * ApprovalNotice follows. Note the status here is the job's raw stage, not the portal stage:
 * toPortalStage folds `completed` into `installed`, so the folded value could never tell a
 * confirmed installation from an unconfirmed one.
 */
describe("AcknowledgeNotice", () => {
  it("confirms an acknowledgement the job agrees with", () => {
    render(<AcknowledgeNotice acknowledged="1" status="completed" />);
    expect(screen.getByRole("status")).toHaveTextContent(THANKS);
  });

  it("says nothing on an ordinary visit", () => {
    render(<AcknowledgeNotice acknowledged={null} status="completed" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  /**
   * The load-bearing one. `?acknowledged=1` is a string anyone can type into their own address
   * bar. A page that believed it would tell a customer whose installation is still open that we
   * have their confirmation — and the owners would never hear the complaint they meant to make.
   */
  it("confirms nothing when the job is not completed, whatever the URL says", () => {
    for (const status of ["quoted", "sold", "ordered", "installed"] as const) {
      const { unmount } = render(<AcknowledgeNotice acknowledged="1" status={status} />);
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText(THANKS)).toBeNull();
      unmount();
    }
  });

  it("tells a customer whose acknowledgement was refused how to reach us", () => {
    render(<AcknowledgeNotice acknowledged="no" status="installed" />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("We could not record that just now.");
    // The number comes from the one place it lives, so it can never go stale on this page.
    expect(notice).toHaveTextContent(business.phone.display);
  });

  /**
   * I2. The same defect as I1, in this component: only the SUCCESS sentence was re-derived.
   *
   * Anything that is not "1" printed the failure line, including on a job the customer has
   * already confirmed — telling them their confirmation failed on the very job they confirmed.
   * When the job's own status says it happened, there is no true refusal to report.
   *
   * The status here is the RAW stage, per the fold trap: `completed` is the only value that
   * says the confirmation landed, and it is exactly the one toPortalStage would hide.
   */
  it("says nothing about a failure when the job is already completed, whatever the URL says", () => {
    for (const acknowledged of ["no", "0", "", "anything"]) {
      const { unmount } = render(<AcknowledgeNotice acknowledged={acknowledged} status="completed" />);
      expect(screen.queryByText(/could not record that just now/i)).toBeNull();
      unmount();
    }
  });

  // The refusal still speaks on a job that is not completed — pinned by "tells a customer whose
  // acknowledgement was refused how to reach us" above, which would fail if this over-suppressed.

  /**
   * The approve side needed widening to every status at or beyond `sold` (F1), because an
   * approved job moves on. This side was checked rather than assumed: `completed` is the LAST
   * stage, so there is no status beyond it for a stale flag to leak a refusal on, and the single
   * `=== "completed"` comparison is therefore complete on its own.
   *
   * Pinned here so that adding a stage after `completed` fails loudly instead of quietly
   * reopening the hole F1 closed on the other component.
   */
  it("has no status beyond completed, so the single comparison is the whole rule", () => {
    const ranks = PORTAL_STATUSES.map((status) => stageRank(status));
    expect(stageRank("completed")).toBe(Math.max(...ranks));
    // And nothing in the whole stage list outranks it either.
    expect(STAGES.every((stage) => stageRank(stage.value) <= stageRank("completed"))).toBe(true);
  });

  // Renamed: this static-renders a component with no interactivity, so it cannot go red for a
  // no-JS regression. What it really pins is that the sentence needs no client boundary — the
  // actual no-JS guarantee is the plain <form> and <a>, covered by the e2e.
  it("renders its sentence server-side, with no client boundary", () => {
    expect(renderToStaticMarkup(<AcknowledgeNotice acknowledged="1" status="completed" />)).toContain(
      THANKS,
    );
    expect(renderToStaticMarkup(<AcknowledgeNotice acknowledged="no" status="installed" />)).toContain(
      business.phone.display,
    );
  });
});

describe("StatusBanner's acknowledgement slot", () => {
  it("seats the acknowledgement in the banner's action row", () => {
    render(
      <StatusBanner
        step={installedStep}
        quoteHref={null}
        acknowledge={<AcknowledgeInstall jobId={JOB} />}
      />,
    );
    const banner = screen.getByRole("region", { name: "Where your project stands" });
    expect(within(banner).getByText(QUESTION)).toBeInTheDocument();
  });

  it("shows no acknowledgement when none is passed", () => {
    render(<StatusBanner step={installedStep} quoteHref={null} />);
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  /** Existing callers are untouched: the approve slot still works on its own. */
  it("still renders the approve slot alone", () => {
    render(<StatusBanner step={installedStep} quoteHref="/project/files/d1" approve={<p>approve me</p>} />);
    expect(screen.getByRole("link", { name: "Review quote" })).toBeInTheDocument();
    expect(screen.getByText("approve me")).toBeInTheDocument();
    expect(screen.queryByText(QUESTION)).toBeNull();
  });
});
