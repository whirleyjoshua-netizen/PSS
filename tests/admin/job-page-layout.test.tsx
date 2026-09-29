import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job: Job = {
  id: ID, createdAt: new Date(), name: "Dana Reyes", phone: "7025550134", email: null, address: null,
  city: "Henderson", treatments: [], windowCount: null, heardVia: null, notes: null, source: "phone",
  status: "new", stageChangedAt: new Date(), visitAt: null, quoteCents: null, soldCents: null,
  depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null, referralCode: null,
  referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false, budgetTier: "mid",
};

const getJob = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ getJob, getEvents: vi.fn(async () => []) }));
vi.mock("@/lib/admin/measurements", () => ({ listMeasurements: vi.fn(async () => []) }));
vi.mock("@/lib/admin/files", () => ({ listFiles: vi.fn(async () => []) }));
vi.mock("@/lib/referrals/db", () => ({ listReferrals: vi.fn(async () => []) }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("not found"); }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(), markLost: vi.fn(async () => ({})), saveDetails: vi.fn(async () => ({})),
  saveNote: vi.fn(async () => ({})), sendPortalInviteNow: vi.fn(), sendReviewNow: vi.fn(),
  saveReviewOptOut: vi.fn(), createReferralLink: vi.fn(), payReferral: vi.fn(),
  assignJobAction: vi.fn(async () => ({})), deleteJobAction: vi.fn(async () => {}),
}));
vi.mock("@/lib/admin/team", () => ({ listTeam: vi.fn(async () => []) }));
vi.mock("@/lib/admin/appointments", () => ({ listAppointments: vi.fn(async () => []) }));
vi.mock("@/lib/routes/settings", () => ({
  getRouteSettings: vi.fn(async () => ({ dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } })),
}));
vi.mock("@/app/admin/jobs/appointment-actions", () => ({
  bookAppointment: vi.fn(async () => ({})), confirmSchedule: vi.fn(async () => ({})),
  cancelAppointmentAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn(), setFileShared: vi.fn() }));

// QuoteTab is an async server component, which the DOM renderer can't await; tests/dc/quote-review covers it.
vi.mock("@/app/admin/jobs/[id]/QuoteTab", () => ({ QuoteTab: ({ job }: { job: Job }) => <p>Quote tab for {job.id}</p> }));

const { default: JobPage } = await import("@/app/admin/jobs/[id]/page");
const open = async (query: { tab?: string; edit?: string }) =>
  render(await JobPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(query) }));

beforeEach(() => { getJob.mockReset().mockResolvedValue(job); });

describe("job page layout", () => {
  it("opens on the Overview", async () => {
    await open({});
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("Overview");
    expect(screen.getByRole("region", { name: "Customer" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Project details" })).toHaveTextContent("Mid-range");
    expect(screen.queryByRole("region", { name: "Next action" })).toBeNull();
  });

  it("shows the Measurements tab", async () => {
    await open({ tab: "measurements" });
    expect(screen.getByText("No windows measured yet.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Customer" })).toBeNull();
  });

  it("shows the Files tab without the measurements block", async () => {
    await open({ tab: "files" });
    expect(screen.getByText("Photos · 0")).toBeInTheDocument();
    expect(screen.queryByText(/^Measurements ·/)).toBeNull();
  });

  it("shows the Activity tab with the note form", async () => {
    await open({ tab: "activity" });
    expect(screen.getByLabelText("Add a note")).toBeInTheDocument();
  });

  it("falls back to the Overview for an unknown tab", async () => {
    await open({ tab: "bogus" });
    expect(screen.getByRole("region", { name: "Customer" })).toBeInTheDocument();
  });

  it("shows the Quote tab", async () => {
    await open({ tab: "quote" });
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("Quote");
    expect(screen.getByText(`Quote tab for ${ID}`)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Customer" })).toBeNull();
  });

  it("opens the details form with ?edit=details", async () => {
    await open({ edit: "details" });
    expect(screen.getByRole("button", { name: /save details/i })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Appointments" })).toBeNull();
  });

  it("keeps the header on every tab", async () => {
    await open({ tab: "files" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dana Reyes");
    expect(screen.getByRole("list", { name: "Stage" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
  });
});
