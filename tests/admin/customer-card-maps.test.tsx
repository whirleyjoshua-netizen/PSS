import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { Job } from "@/lib/admin/jobs";
import { CustomerCard } from "@/app/admin/jobs/[id]/OverviewCards";

const job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: null,
  address: "12 Main St", city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "contact", status: "new", stageChangedAt: new Date(),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [],
  orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false, portalInvitedAt: null, budgetTier: null,
} as Job;

describe("CustomerCard address", () => {
  // Owner 2026-10-02: tapping the address must not take the owner off the client's page.
  it("opens Google Maps in a new window, keeping the client page open", () => {
    render(<CustomerCard job={job} referrer={null} />);
    const link = screen.getByRole("link", { name: "12 Main St, Henderson" });
    expect(link).toHaveAttribute("href", "https://maps.google.com/?q=12%20Main%20St%2C%20Henderson%2C%20NV");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("CustomerCard source", () => {
  it("shows a Google lead form lead as \"Google lead form\", not its stored code", () => {
    render(<CustomerCard job={{ ...job, source: "google_form" }} referrer={null} />);
    expect(screen.getByText("Google lead form")).toBeInTheDocument();
    expect(screen.queryByText("google_form")).toBeNull();
  });

  it("keeps showing a website lead's form as before", () => {
    render(<CustomerCard job={job} referrer={null} />);
    expect(screen.getByText("contact")).toBeInTheDocument();
  });
});
