import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({ saveDetails: vi.fn() }));
const { DetailsForm } = await import("@/app/admin/jobs/[id]/DetailsForm");

const job: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: null,
  address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "phone", status: "new", stageChangedAt: new Date(),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [],
  orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false, portalInvitedAt: null, budgetTier: null,
  windowCountExact: 12, treatmentTypes: ["roman_shades"], motorized: true, gateCode: "#4321",
};

describe("DetailsForm", () => {
  it("has no gate code field: it lives in the scheduler and Edit notes (owner 2026-10-01)", () => {
    render(<DetailsForm job={job} />);
    expect(screen.queryByLabelText(/gate/i)).toBeNull();
    expect(document.querySelector('[name="gateCode"]')).toBeNull();
  });

  it("lets the owner correct the questionnaire answers", () => {
    render(<DetailsForm job={job} />);
    expect(screen.getByLabelText("Exact windows")).toHaveValue("12");
    expect(screen.getByLabelText("Roman shades")).toBeChecked();
    expect(screen.getByLabelText("Shutters")).not.toBeChecked();
    expect(screen.getByLabelText("Motorized")).toBeChecked();
  });
  it("lets the owner correct the address and city", () => {
    render(<DetailsForm job={{ ...job, address: "12 Sample St", city: "North Las Vegas" }} />);
    expect(screen.getByLabelText("Address")).toHaveValue("12 Sample St");
    expect(screen.getByLabelText("City")).toHaveValue("North Las Vegas");
  });
  it("keeps a city outside the service area selected instead of replacing it", () => {
    render(<DetailsForm job={{ ...job, city: "Boulder City" }} />);
    expect(screen.getByLabelText("City")).toHaveValue("Boulder City");
  });
  it("leaves the appointment dates to the Schedule button", () => {
    const { container } = render(<DetailsForm job={job} />);
    expect(screen.queryByLabelText(/visit date and time/i)).toBeNull();
    expect(screen.queryByLabelText(/install date/i)).toBeNull();
    expect(container.querySelector('input[name="visitAtLoaded"]')).toBeNull();
    expect(container.querySelector('input[name="installOnLoaded"]')).toBeNull();
  });

  it("keeps the order date but has no money fields: pricing lives on the Install tab", () => {
    const { container } = render(<DetailsForm job={job} />);
    expect(screen.getByLabelText("Order date")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quote")).toBeNull();
    expect(screen.queryByLabelText("Sold amount")).toBeNull();
    expect(screen.queryByLabelText("Deposit received")).toBeNull();
    for (const name of ["quote", "sold", "deposit"]) {
      expect(container.querySelector(`input[name="${name}"]`)).toBeNull();
    }
  });
});
