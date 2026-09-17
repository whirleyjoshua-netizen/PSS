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

  describe("requesting a service", () => {
    const serviceLink = () => screen.queryByRole("link", { name: /request a service/i });

    it("offers a service link on the customer's own job, once installed", () => {
      render(<AfterWork project={project} />);
      expect(serviceLink()).toHaveAttribute("href", `/project/${project.id}/service`);
    });

    // The same reason the review link waits: there is no finished work to come back out to.
    it.each(["quoted", "sold", "ordered"] as const)("stays away while the job is %s", (status) => {
      render(<AfterWork project={{ ...project, status }} />);
      expect(serviceLink()).toBeNull();
    });

    it("says when a service was requested, and names its project number", () => {
      render(
        <AfterWork project={project} serviceRequests={[{ on: "Sep 16", projectNo: "PSS-1051" }]} />,
      );
      expect(
        screen.getByText("Service requested on Sep 16 (PSS-1051) — we will be in touch."),
      ).toBeInTheDocument();
    });

    /** A second broken blind must not erase the first one they reported. */
    it("lists every request, not only the most recent", () => {
      render(
        <AfterWork
          project={project}
          serviceRequests={[
            { on: "Mar 3", projectNo: "PSS-1090" },
            { on: "Jan 8", projectNo: "PSS-1051" },
          ]}
        />,
      );
      expect(screen.getByText(/Mar 3 \(PSS-1090\)/)).toBeInTheDocument();
      expect(screen.getByText(/Jan 8 \(PSS-1051\)/)).toBeInTheDocument();
    });

    it("says nothing when none has been requested", () => {
      render(<AfterWork project={project} serviceRequests={[]} />);
      expect(screen.queryByText(/service requested on/i)).toBeNull();
    });

    /** Straight after submitting: the reference they quote when they call. */
    it("confirms a request just filed, naming the new project number", () => {
      render(
        <AfterWork
          project={project}
          serviceRequests={[{ on: "Sep 16", projectNo: "PSS-1051" }]}
          justRequested="PSS-1051"
        />,
      );
      const confirmation = screen.getByRole("status");
      expect(confirmation).toHaveTextContent("Thanks — we have your request and will be in touch.");
      expect(confirmation).toHaveTextContent("PSS-1051");
    });

    /**
     * `?requested=` is the customer's own URL, so a crafted link must not be able to tell them
     * we have a request we do not have. The value is believed only when it names one of the
     * requests actually on the job — and the real list is untouched either way, so a tampered
     * link cannot erase the requests they did file.
     */
    it("confirms nothing for a project number that is not one of theirs", () => {
      render(
        <AfterWork
          project={project}
          serviceRequests={[{ on: "Sep 16", projectNo: "PSS-1051" }]}
          justRequested="PSS-9999"
        />,
      );
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText(/PSS-9999/)).toBeNull();
      expect(
        screen.getByText("Service requested on Sep 16 (PSS-1051) — we will be in touch."),
      ).toBeInTheDocument();
    });

    /** With no requests loaded at all there is nothing a crafted value could match. */
    it("confirms nothing when the customer has no service requests", () => {
      render(<AfterWork project={project} serviceRequests={[]} justRequested="PSS-9999" />);
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows no confirmation on an ordinary visit", () => {
      render(<AfterWork project={project} serviceRequests={[{ on: "Sep 16", projectNo: "PSS-1051" }]} />);
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("is a plain link with JavaScript off", () => {
      const html = renderToStaticMarkup(
        <AfterWork
          project={project}
          serviceRequests={[{ on: "Sep 16", projectNo: "PSS-1051" }]}
          justRequested="PSS-1051"
        />,
      );
      expect(html).toContain(`/project/${project.id}/service`);
      expect(html).toContain("Service requested on Sep 16");
      expect(html).toContain("PSS-1051");
    });
  });
});
