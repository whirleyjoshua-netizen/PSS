import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job: Job = {
  id: ID, createdAt: new Date("2026-09-01T00:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: null, address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "contact", status: "quoted", stageChangedAt: new Date(), visitAt: null,
  quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null,
  lostReason: null, referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false,
};

const jobs = { listJobs: vi.fn(), getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const listMeasurements = vi.fn();
vi.mock("@/lib/admin/measurements", () => ({ listMeasurements }));
const listFiles = vi.fn();
vi.mock("@/lib/admin/files", () => ({ listFiles }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/app/admin/jobs/actions", () => ({ moveStage: vi.fn(), markLost: vi.fn(async () => ({})) }));
vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn() }));

const { default: BoardPage } = await import("@/app/admin/page");
const open = async (params: { lost?: string; job?: string }) =>
  render(await BoardPage({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  jobs.listJobs.mockReset().mockResolvedValue([job]);
  jobs.getJob.mockReset().mockResolvedValue(job);
  listMeasurements.mockReset().mockResolvedValue([]);
  listFiles.mockReset().mockResolvedValue([]);
});

describe("board page", () => {
  it("shows no panel and loads no job details without ?job", async () => {
    await open({});
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(jobs.getJob).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /dana reyes/i })).toHaveAttribute("href", `/admin?job=${ID}`);
  });

  it("opens the panel for ?job, marks the card, and closes back to the board", async () => {
    await open({ job: ID });
    expect(screen.getByRole("complementary", { name: /dana reyes/i })).toBeInTheDocument();
    expect(listMeasurements).toHaveBeenCalledWith(ID);
    expect(listFiles).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("link", { name: /dana reyes/i, current: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin");
  });

  it("keeps the lost toggle in card and close links", async () => {
    await open({ lost: "1", job: ID });
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin?lost=1");
    expect(screen.getByRole("link", { name: /dana reyes/i, current: true })).toHaveAttribute("href", `/admin?lost=1&job=${ID}`);
  });

  it("shows the not-found panel for a job that no longer exists", async () => {
    jobs.getJob.mockResolvedValue(null);
    await open({ job: "nope" });
    expect(screen.getByText("That job no longer exists.")).toBeInTheDocument();
    expect(listMeasurements).not.toHaveBeenCalled();
  });
});
