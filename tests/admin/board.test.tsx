import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JobCard, groupByStage } from "@/app/admin/JobCard";
import type { Job } from "@/lib/admin/jobs";
import { BOARD_STAGES } from "@/lib/admin/stages";

const job = (overrides: Partial<Job>): Job => ({
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date("2026-09-01T00:00:00Z"),
  name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson",
  treatments: ["Shades", "Shutters"], windowCount: null, heardVia: null, notes: null, source: "contact",
  status: "new", stageChangedAt: new Date("2026-09-07T00:00:00Z"), visitAt: null, quoteCents: null,
  soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
  ...overrides,
});

describe("board", () => {
  it("groups jobs into the given stages, in order, even when empty", () => {
    const groups = groupByStage([job({ status: "sold" }), job({ status: "completed" })], BOARD_STAGES);
    expect(groups.map((g) => g.label)).toEqual([
      "New lead", "Contacted", "Appointment booked", "Quoted", "Approved", "Signed", "Sold", "Official measure", "Ordered", "Installed",
    ]);
    expect(groups.find((g) => g.stage === "sold")!.jobs).toHaveLength(1);
  });

  const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
  /** The card is a div wrapping one link: the customer's name. */
  const link = () => screen.getByRole("link", { name: /dana reyes/i });
  const card = () => link().closest("div")!;

  it("shows the name, city, interests, and days in stage", () => {
    // Quoted for 3 days: the limit is 7, so not overdue.
    render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(card()).toHaveTextContent("Dana Reyes");
    expect(card()).toHaveTextContent("Henderson");
    expect(card()).toHaveTextContent("Shades, Shutters");
    expect(card()).toHaveTextContent("3 days");
    expect(card()).not.toHaveTextContent("Overdue");
  });

  it("links to the full job page, and the link covers the whole card", () => {
    render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(link()).toHaveAttribute("href", `/admin/jobs/${ID}`);
    // The overlay is what makes the card clickable, not just the name.
    expect(link().className).toContain("after:absolute");
    expect(link().className).toContain("after:inset-0");
  });

  it("names who the job is assigned to, with their tag", () => {
    render(
      <JobCard
        job={job({ assignedTo: "b", assignedName: "Shade", assignedRole: "designer" })}
        now={new Date("2026-09-10T00:00:00Z")}
       
      />,
    );
    // Same matcher the unassigned case asserts is absent, so that case can't pass vacuously.
    expect(within(card()).getByText(/\S+ · (Designer|Installer)$/)).toHaveTextContent("Shade · Designer");
  });

  it("shows the PSS number on the card", () => {
    render(<JobCard job={job({ projectNo: 1042 })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(screen.getByText("PSS-1042")).toBeInTheDocument();
  });

  it("shows no number on a card for a job that has none", () => {
    render(<JobCard job={job({ projectNo: null })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(screen.queryByText(/^PSS-/)).toBeNull();
  });

  it("says nothing about an assignee when the job has none", () => {
    render(<JobCard job={job({})} now={new Date("2026-09-10T00:00:00Z")} />);
    // No "Name · Role" line at all — not merely the absence of the word "Designer".
    expect(within(card()).queryByText(/\S+ · (Designer|Installer)$/)).toBeNull();
    expect(card()).not.toHaveTextContent("Designer");
  });

  it("flags a job that is overdue in its stage", () => {
    // New lead for 3 days: the limit is 1.
    render(<JobCard job={job({ status: "new" })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(card()).toHaveTextContent("Overdue");
  });

  it("never marks a card as current, now that nothing opens beside the board", () => {
    render(<JobCard job={job({})} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(link()).not.toHaveAttribute("aria-current");
  });

  it("marks referred jobs with a Referral badge", () => {
    render(<JobCard job={job({ referredBy: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6d" })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(card()).toHaveTextContent("Referral");
  });

  it("marks a customer's service request with a Service marker", () => {
    render(<JobCard job={job({ source: "service" })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(within(card()).getByText("Service")).toBeInTheDocument();
  });

  it("puts no Service marker on an ordinary job", () => {
    render(<JobCard job={job({ source: "phone" })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(within(card()).queryByText("Service")).toBeNull();
  });

  it("shows the city with a pin and the days with a clock, both decorative", () => {
    const { container } = render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
  });
});
