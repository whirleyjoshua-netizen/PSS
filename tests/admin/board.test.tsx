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
      "New lead", "Appointment booked", "Quoted", "Sold", "Ordered", "Installed",
    ]);
    expect(groups.find((g) => g.stage === "sold")!.jobs).toHaveLength(1);
  });

  const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
  /** The card is a div now; the two name links inside it are [mobile, desktop]. */
  const links = () => screen.getAllByRole("link", { name: /dana reyes/i });
  const card = () => links()[0].closest("div")!;

  it("shows the name, city, interests, and days in stage", () => {
    // Quoted for 3 days: the limit is 7, so not overdue.
    render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} href={`/admin?job=${ID}`} />);
    expect(card()).toHaveTextContent("Dana Reyes");
    expect(card()).toHaveTextContent("Henderson");
    expect(card()).toHaveTextContent("Shades, Shutters");
    expect(card()).toHaveTextContent("3 days");
    expect(card()).not.toHaveTextContent("Overdue");
  });

  it("links to the full job page on mobile and to the given panel href on desktop", () => {
    render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} href={`/admin?job=${ID}`} />);
    const [mobile, desktop] = links();
    expect(mobile).toHaveAttribute("href", `/admin/jobs/${ID}`);
    expect(mobile).toHaveClass("lg:hidden");
    expect(desktop).toHaveAttribute("href", `/admin?job=${ID}`);
    expect(desktop).toHaveClass("hidden");
    expect(desktop).not.toHaveAttribute("aria-current");
  });

  it("names who the job is assigned to, with their tag", () => {
    render(
      <JobCard
        job={job({ assignedTo: "b", assignedName: "Shade", assignedRole: "designer" })}
        now={new Date("2026-09-10T00:00:00Z")}
        href="/admin"
      />,
    );
    // Same matcher the unassigned case asserts is absent, so that case can't pass vacuously.
    expect(within(card()).getByText(/\S+ · (Designer|Installer)$/)).toHaveTextContent("Shade · Designer");
  });

  it("says nothing about an assignee when the job has none", () => {
    render(<JobCard job={job({})} now={new Date("2026-09-10T00:00:00Z")} href="/admin" />);
    // No "Name · Role" line at all — not merely the absence of the word "Designer".
    expect(within(card()).queryByText(/\S+ · (Designer|Installer)$/)).toBeNull();
    expect(card()).not.toHaveTextContent("Designer");
  });

  it("flags a job that is overdue in its stage", () => {
    // New lead for 3 days: the limit is 1.
    render(<JobCard job={job({ status: "new" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin" />);
    expect(card()).toHaveTextContent("Overdue");
  });

  it("marks only the desktop link of the card whose panel is open", () => {
    render(<JobCard job={job({})} now={new Date("2026-09-10T00:00:00Z")} href="/admin" selected />);
    const [mobile, desktop] = links();
    expect(desktop).toHaveAttribute("aria-current", "true");
    // The panel is desktop-only, so the mobile link never claims to be the open one.
    expect(mobile).not.toHaveAttribute("aria-current");
  });

  it("marks referred jobs with a Referral badge", () => {
    render(<JobCard job={job({ referredBy: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6d" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin" />);
    expect(card()).toHaveTextContent("Referral");
  });

  it("shows the city with a pin and the days with a clock, both decorative", () => {
    const { container } = render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin" />);
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
  });
});
