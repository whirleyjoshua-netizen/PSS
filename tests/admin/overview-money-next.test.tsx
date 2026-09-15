import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({ moveStage: vi.fn(), markLost: vi.fn(async () => ({})) }));
const { MoneyStrip } = await import("@/app/admin/jobs/[id]/MoneyStrip");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const EDIT = `/admin/jobs/${ID}?tab=overview&edit=details`;
const job: Job = {
  id: ID, createdAt: new Date(), name: "Dana Reyes", phone: "7025550134", email: null, address: null,
  city: "Henderson", treatments: [], windowCount: null, heardVia: null, notes: null, source: "phone",
  status: "new", stageChangedAt: new Date(), visitAt: null, quoteCents: null, soldCents: null,
  depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null, referralCode: null,
  referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false, budgetTier: null,
};

describe("MoneyStrip", () => {
  it("collapses to a prompt before there is a quote", () => {
    render(<MoneyStrip job={job} editHref={EDIT} />);
    const money = screen.getByRole("region", { name: "Money" });
    expect(within(money).getByText("No quote yet.")).toBeInTheDocument();
    expect(within(money).getByRole("link", { name: "Add quote" })).toHaveAttribute("href", EDIT);
  });

  it("shows the balance as sold minus deposit", () => {
    render(<MoneyStrip job={{ quoteCents: 520000, soldCents: 500000, depositCents: 250000 }} editHref={EDIT} />);
    const balance = screen.getByText("Balance").closest("div")!;
    expect(balance).toHaveTextContent("$2,500");
    expect(screen.getByText("Quote").closest("div")).toHaveTextContent("$5,200");
  });

  it("shows no balance before a sale", () => {
    render(<MoneyStrip job={{ quoteCents: 520000, soldCents: null, depositCents: null }} editHref={EDIT} />);
    expect(screen.getByText("Balance").closest("div")).toHaveTextContent("—");
  });
});
