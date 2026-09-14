import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));

const getJob = vi.fn();
const getEvents = vi.fn(async () => []);
vi.mock("@/lib/admin/jobs", () => ({ getJob, getEvents }));

const listFiles = vi.fn(async () => []);
vi.mock("@/lib/admin/files", () => ({ listFiles }));

const listMeasurements = vi.fn(async () => []);
vi.mock("@/lib/admin/measurements", () => ({ listMeasurements }));

const listReferrals = vi.fn(async () => []);
vi.mock("@/lib/referrals/db", () => ({ listReferrals }));

const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
const useRouter = vi.fn(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound, useRouter }));

vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(async () => {}),
  markLost: vi.fn(async () => ({})),
  saveNote: vi.fn(async () => ({})),
  saveDetails: vi.fn(async () => ({})),
  sendPortalInviteNow: vi.fn(async () => ({})),
  sendReviewNow: vi.fn(async () => ({})),
  saveReviewOptOut: vi.fn(async () => {}),
  createReferralLink: vi.fn(async () => ({})),
  payReferral: vi.fn(async () => ({})),
}));

vi.mock("@/app/admin/jobs/measure-actions", () => ({
  removeFile: vi.fn(async () => {}),
  removeMeasurement: vi.fn(async () => {}),
}));

const JobPage = (await import("@/app/admin/jobs/[id]/page")).default;

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

const baseJob: Job = {
  id: ID, createdAt: new Date(), name: "Dana Reyes", phone: "7025550134", email: null,
  address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "phone", status: "quoted", stageChangedAt: new Date(),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [],
  orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false, portalInvitedAt: null, budgetTier: null,
};

const budgetRow = () => {
  const dt = screen.getAllByText("Budget").find((el) => el.tagName === "DT");
  if (!dt) throw new Error("No <dt>Budget</dt> found in the summary");
  return dt.nextElementSibling;
};

beforeEach(() => {
  getJob.mockReset();
  requireAdmin.mockClear();
});

describe("job page summary", () => {
  it("shows the budget tier in the summary", async () => {
    getJob.mockResolvedValue({ ...baseJob, budgetTier: "mid" });
    render(await JobPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) }));
    expect(budgetRow()).toHaveTextContent("Mid-range");
  });

  it("shows a dash when no budget tier is set", async () => {
    getJob.mockResolvedValue({ ...baseJob, budgetTier: null });
    render(await JobPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) }));
    expect(budgetRow()).toHaveTextContent("—");
  });

  it("offers a Call button under the name", async () => {
    getJob.mockResolvedValue({ ...baseJob });
    render(await JobPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Log a call" })).toHaveAttribute("href", `/admin/jobs/${baseJob.id}/call`);
  });
});
