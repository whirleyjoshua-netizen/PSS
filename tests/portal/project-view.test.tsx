import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const listSharedPhotos = vi.fn();
vi.mock("@/lib/admin/files", () => ({ listSharedPhotos }));
const ensureReferralCode = vi.fn();
vi.mock("@/lib/referrals/db", () => ({ ensureReferralCode }));
const countReferred = vi.fn();
vi.mock("@/lib/portal/project", () => ({ countReferred }));
vi.mock("@/app/(site)/project/actions", () => ({ signOutCustomer: vi.fn() }));

const { ProjectView } = await import("@/app/(site)/project/ProjectView");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job = {
  id: JOB, createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: "maria@example.com",
  address: "12 Palm Way", city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: "Gate code 1234", source: "website", status: "ordered" as const, stageChangedAt: new Date(),
  visitAt: null, quoteCents: 450000, soldCents: 420000, depositCents: 100000, brands: ["Hunter Douglas"],
  orderedOn: "2026-09-20", installOn: "2026-10-13", lostReason: null, referralCode: null, referredBy: null,
  referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};

beforeEach(() => {
  listSharedPhotos.mockReset().mockResolvedValue([{ id: "p1", name: "Living room.jpg" }]);
  ensureReferralCode.mockReset().mockResolvedValue("K7QX2M");
  countReferred.mockReset().mockResolvedValue(2);
});

describe("ProjectView", () => {
  it("greets the customer and shows where the job is", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hi Maria");
    expect(screen.getByText("12 Palm Way, Henderson")).toBeInTheDocument();
    const current = screen.getByText("In production").closest("li")!;
    expect(current).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Install scheduled: Tue, Oct 13")).toBeInTheDocument();
  });

  it("shows only shared photos, through the customer route", async () => {
    render(await ProjectView({ job }));
    expect(listSharedPhotos).toHaveBeenCalledWith(JOB);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/project/files/p1");
  });

  it("shows an empty state with no shared photos", async () => {
    listSharedPhotos.mockResolvedValue([]);
    render(await ProjectView({ job }));
    expect(screen.getByText("Photos from your install will appear here.")).toBeInTheDocument();
  });

  it("gives the referral link and count", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByText("https://premiershadesolutions.com/r/K7QX2M")).toBeInTheDocument();
    expect(screen.getByText("Friends referred so far: 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("never shows money, notes or brands", async () => {
    const { container } = render(await ProjectView({ job }));
    const text = container.textContent ?? "";
    expect(text.replace("$100", "")).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/4,500|4,200|1,000|Gate code|Hunter Douglas/);
  });

  it("lets the customer sign out and contact us", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "(725) 400-5254" })).toHaveAttribute("href", "tel:+17254005254");
  });
});
