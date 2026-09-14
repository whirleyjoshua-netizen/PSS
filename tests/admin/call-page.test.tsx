import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));

const getJob = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ getJob }));

const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound }));

vi.mock("@/app/admin/jobs/call-actions", () => ({ logCallAction: vi.fn() }));

const CallPage = (await import("@/app/admin/jobs/[id]/call/page")).default;

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

const job: Job = {
  id: JOB, createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: null,
  address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "phone", status: "new", stageChangedAt: new Date(),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [],
  orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false, portalInvitedAt: null, budgetTier: null,
};

beforeEach(() => {
  getJob.mockReset();
  requireAdmin.mockClear();
});

describe("call page", () => {
  it("shows who to call with a tap-to-call number", async () => {
    getJob.mockResolvedValue(job);
    render(await CallPage({ params: Promise.resolve({ id: JOB }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Call Maria Lopez");
    expect(screen.getByRole("link", { name: "(702) 555-0100" })).toHaveAttribute("href", "tel:+17025550100");
    expect(screen.getByRole("link", { name: "← Back to job" })).toHaveAttribute("href", `/admin/jobs/${JOB}`);
  });

  it("is not found for a missing job", async () => {
    getJob.mockResolvedValue(null);
    await expect(CallPage({ params: Promise.resolve({ id: JOB }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
