import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JobList } from "@/app/admin/JobList";
import type { Job } from "@/lib/admin/jobs";

const base: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date("2026-09-01T00:00:00Z"),
  name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson",
  treatments: [], windowCount: null, heardVia: null, notes: null, source: "contact",
  status: "completed", stageChangedAt: new Date("2026-09-07T00:00:00Z"), visitAt: null, quoteCents: null,
  soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};
const lost: Job = { ...base, id: "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d", name: "Chris Lane", city: "Las Vegas", status: "lost" };
const NOW = new Date("2026-09-10T00:00:00Z");

describe("JobList", () => {
  it("lists every job with its city, stage and time in stage, and counts them", () => {
    render(<JobList jobs={[base, lost]} now={NOW} filter={null} q="" openId={undefined} />);
    expect(screen.getByRole("heading", { name: "All jobs · 2" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Dana Reyes");
    expect(rows[0]).toHaveTextContent("Henderson");
    expect(rows[0]).toHaveTextContent("Completed");
    expect(rows[0]).toHaveTextContent("3 days");
    expect(rows[1]).toHaveTextContent("Lost");
  });

  it("has an Assigned to column after City, showing the person or a dash", () => {
    const assigned: Job = { ...base, assignedTo: "b", assignedName: "Shade", assignedRole: "designer" };
    render(<JobList jobs={[assigned, lost]} now={NOW} filter={null} q="" openId={undefined} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Customer", "City", "Assigned to", "Stage", "In stage"]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getAllByRole("cell")[2]).toHaveTextContent("Shade · Designer");
    expect(within(rows[1]).getAllByRole("cell")[2]).toHaveTextContent("—");
  });

  it("links each row to the full job page on mobile and to its panel on desktop", () => {
    render(<JobList jobs={[base]} now={NOW} filter="completed" q="reyes" openId={base.id} />);
    const [mobile, desktop] = screen.getAllByRole("link", { name: /dana reyes/i });
    expect(mobile).toHaveAttribute("href", `/admin/jobs/${base.id}`);
    expect(mobile).toHaveClass("lg:hidden");
    expect(mobile).not.toHaveAttribute("aria-current");
    // The panel only exists on desktop, so only that link keeps the search and filter.
    expect(desktop).toHaveAttribute("href", `/admin?q=reyes&list=completed&job=${base.id}`);
    expect(desktop).toHaveClass("hidden");
    expect(desktop).toHaveAttribute("aria-current", "true");
  });

  it("makes the whole row one link at each breakpoint", () => {
    render(<JobList jobs={[base]} now={NOW} filter={null} q="" openId={undefined} />);
    const row = screen.getAllByRole("row")[1];
    const links = within(row).getAllByRole("link");
    // Two in the DOM, but only one is displayed at a time, so a row is never two tap targets.
    expect(links).toHaveLength(2);
    expect(row.className).toContain("relative");
    for (const link of links) {
      expect(link.className).toContain("after:absolute");
      expect(link.className).toContain("after:inset-0");
    }
  });

  it("tags a referred job", () => {
    render(<JobList jobs={[{ ...base, referredBy: "PSS-AB12" }, lost]} now={NOW} filter={null} q="" openId={undefined} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Referral");
    expect(rows[1]).not.toHaveTextContent("Referral");
  });

  it("has a stage dropdown in a GET form that keeps the search and open job", () => {
    render(<JobList jobs={[]} now={NOW} filter="lost" q="reyes" openId={base.id} />);
    const select = screen.getByLabelText("Stage");
    expect(select).toHaveValue("lost");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All jobs", "New lead", "Appointment booked", "Quoted", "Sold", "Ordered", "Installed", "Completed", "Lost",
    ]);
    const form = select.closest("form")!;
    expect(form).toHaveAttribute("action", "/admin");
    expect(form.querySelector('input[name="q"]')).toHaveValue("reyes");
    expect(form.querySelector('input[name="job"]')).toHaveValue(base.id);
    expect(within(form).getByRole("button", { name: "Show" })).toBeInTheDocument();
  });

  it("says when there are no jobs, a stage has none, or a search matches none", () => {
    const { rerender } = render(<JobList jobs={[]} now={NOW} filter={null} q="" openId={undefined} />);
    expect(screen.getByText("No jobs yet")).toBeInTheDocument();
    rerender(<JobList jobs={[]} now={NOW} filter="completed" q="" openId={undefined} />);
    expect(screen.getByText("No jobs in this stage")).toBeInTheDocument();
    rerender(<JobList jobs={[]} now={NOW} filter={null} q="zzz" openId={undefined} />);
    expect(screen.getByText("No jobs match")).toBeInTheDocument();
  });
});
