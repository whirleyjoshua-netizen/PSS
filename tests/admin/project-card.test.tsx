import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { Job } from "@/lib/admin/jobs";
import { ProjectCard } from "@/app/admin/jobs/[id]/OverviewCards";

const job: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: null,
  address: null, city: "Henderson", treatments: ["Shades"], windowCount: "6-10", heardVia: null,
  notes: null, source: "contact", status: "new", stageChangedAt: new Date(),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [],
  orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false, portalInvitedAt: null, budgetTier: "premium",
  windowCountExact: 31, treatmentTypes: ["cellular_shades", "shutters"], motorized: true, gateCode: "#4321", finish: "luxury",
};

const value = (term: string) => {
  const dt = within(screen.getByRole("region", { name: "Project details" })).getByText(term, { selector: "dt" });
  return dt.nextElementSibling as HTMLElement;
};

describe("ProjectCard", () => {
  it("shows the questionnaire answers beside the website form's", () => {
    render(<ProjectCard job={job} editHref="#" />);
    expect(value("Interested in")).toHaveTextContent("Shades");
    expect(value("Windows")).toHaveTextContent("6-10");
    expect(value("Exact windows")).toHaveTextContent("30+");
    expect(value("Treatment types")).toHaveTextContent("ShuttersCellular shades");
    expect(value("Motorized")).toHaveTextContent("Yes");
    expect(value("Gate code")).toHaveTextContent("#4321");
    expect(value("Budget")).toHaveTextContent("Luxury → Premium");
  });

  it("shows dashes and No when nothing was given", () => {
    render(<ProjectCard job={{ ...job, windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null, finish: null, budgetTier: "mid" }} editHref="#" />);
    expect(value("Exact windows")).toHaveTextContent("—");
    expect(value("Treatment types")).toHaveTextContent("—");
    expect(value("Motorized")).toHaveTextContent("No");
    expect(value("Gate code")).toHaveTextContent("—");
    expect(value("Budget")).toHaveTextContent("Mid-range");
  });
});
