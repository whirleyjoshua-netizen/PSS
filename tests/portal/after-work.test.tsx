import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { business } from "@/content/business";
import { toPortalStage } from "@/lib/portal/progress";
import { AfterWork } from "@/app/(site)/project/AfterWork";
import type { ProjectSummary } from "@/lib/portal/access";

const project: ProjectSummary = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c",
  firstName: "Maria",
  address: "12 Palm Way",
  city: "Henderson",
  status: "installed",
  installOn: "2025-10-13",
  projectNo: "PSS-1048",
  windowCount: 9,
  treatmentTypes: ["shutters"],
  finish: "designer",
  orderedOn: "2025-09-20",
  steps: [],
};

const reviewLink = () => screen.queryByRole("link", { name: /leave a review/i });

describe("AfterWork", () => {
  // The section speaks in the past tense about work that is finished, so it must stay
  // away until the job actually is. Every stage before Installed is checked, not just one.
  it.each(["quoted", "sold", "ordered"] as const)("does not appear while the job is %s", (status) => {
    render(<AfterWork project={{ ...project, status }} />);
    expect(reviewLink()).toBeNull();
    expect(screen.queryByRole("region", { name: /after the work is done/i })).toBeNull();
  });

  it("offers a review link once installed", () => {
    render(<AfterWork project={{ ...project, status: "installed" }} />);
    const link = screen.getByRole("link", { name: /leave a review/i });
    expect(link).toHaveAttribute("href", business.socials.googleBusinessProfile);
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  /**
   * A completed job is a finished job. toPortalStage folds `completed` into `installed`,
   * so the page's own status can only ever be `installed` — this pins that fold, so the
   * section cannot start missing the very customers whose work is most finished.
   */
  it("covers a completed job, which reaches the page as installed", () => {
    expect(toPortalStage("completed")).toBe("installed");
    render(<AfterWork project={{ ...project, status: toPortalStage("completed") }} />);
    expect(reviewLink()).not.toBeNull();
  });

  it("says why a review matters, and gives the section its own heading", () => {
    render(<AfterWork project={project} />);
    const section = screen.getByRole("region", { name: "After the work is done" });
    expect(
      within(section).getByText(
        "Happy with the work? A review helps two people running a small business more than you would think.",
      ),
    ).toBeInTheDocument();
  });

  // The link leaves our site, so it must not hand the destination a live window handle.
  it("opens the review page safely in a new tab", () => {
    render(<AfterWork project={project} />);
    const link = screen.getByRole("link", { name: /leave a review/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  // Nothing here is interactive, so the whole section must survive with JavaScript off.
  it("renders as a plain link without JavaScript", () => {
    const html = renderToStaticMarkup(<AfterWork project={project} />);
    expect(html).toContain(business.socials.googleBusinessProfile);
    expect(html).toContain("Leave a review");
  });
});
