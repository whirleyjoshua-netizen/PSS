import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JobCard, groupByStage } from "@/app/admin/JobCard";
import type { Job } from "@/lib/admin/jobs";

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
  it("groups jobs into the seven stages, in order, even when empty", () => {
    const groups = groupByStage([job({ status: "sold" })], false);
    expect(groups.map((g) => g.label)).toEqual([
      "New lead", "Contacted", "Visit booked", "Quoted", "Sold", "Ordered", "Installed",
    ]);
    expect(groups.find((g) => g.stage === "sold")!.jobs).toHaveLength(1);
  });

  it("adds a Lost group only when asked", () => {
    expect(groupByStage([], true).at(-1)!.label).toBe("Lost");
    expect(groupByStage([], false).some((g) => g.stage === "lost")).toBe(false);
  });

  it("shows the name, city, interests, and days in stage, and links to the given href", () => {
    // Quoted for 3 days: the limit is 7, so not overdue.
    render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin?job=3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" />);
    const link = screen.getByRole("link", { name: /dana reyes/i });
    expect(link).toHaveAttribute("href", "/admin?job=3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    expect(link).toHaveTextContent("Henderson");
    expect(link).toHaveTextContent("Shades, Shutters");
    expect(link).toHaveTextContent("3 days");
    expect(link).not.toHaveTextContent("Overdue");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("flags a job that is overdue in its stage", () => {
    // New lead for 3 days: the limit is 1.
    render(<JobCard job={job({ status: "new" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin" />);
    expect(screen.getByRole("link", { name: /dana reyes.*overdue/i })).toBeInTheDocument();
  });

  it("marks the card whose panel is open", () => {
    render(<JobCard job={job({})} now={new Date("2026-09-10T00:00:00Z")} href="/admin" selected />);
    expect(screen.getByRole("link", { name: /dana reyes/i })).toHaveAttribute("aria-current", "true");
  });

  it("marks referred jobs with a Referral badge", () => {
    render(<JobCard job={job({ referredBy: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6d" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin" />);
    expect(screen.getByRole("link", { name: /dana reyes/i })).toHaveTextContent("Referral");
  });
});
