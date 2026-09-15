import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(), markLost: vi.fn(async () => ({})), saveDetails: vi.fn(async () => ({})),
  saveNote: vi.fn(async () => ({})), sendPortalInviteNow: vi.fn(), sendReviewNow: vi.fn(),
  saveReviewOptOut: vi.fn(), createReferralLink: vi.fn(), payReferral: vi.fn(),
}));
vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn(), setFileShared: vi.fn() }));
const { OverviewTab } = await import("@/app/admin/jobs/[id]/OverviewTab");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const now = new Date("2026-09-14T18:00:00Z");
const job: Job = {
  id: ID, createdAt: now, name: "Dana Reyes", phone: "7025550134", email: "dana@example.com",
  address: "12 Elm St", city: "Henderson", treatments: ["Shutters"], windowCount: "6-10", heardVia: "Google",
  notes: "Prefers white", source: "contact", status: "ordered", stageChangedAt: now, visitAt: null,
  quoteCents: 520000, soldCents: 500000, depositCents: 250000, brands: ["Alta Window Fashions"],
  orderedOn: "2026-09-18", installOn: null, lostReason: null, referralCode: null, referredBy: null,
  referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false, budgetTier: "mid",
  treatmentTypes: ["shutters"],
};
const base = { job, editing: false, now, measurements: [], files: [], events: [], referrals: [], referrer: null };

describe("OverviewTab", () => {
  it("shows the customer, project, next action and money", () => {
    render(<OverviewTab {...base} />);
    expect(screen.getByRole("region", { name: "Customer" })).toHaveTextContent("(702) 555-0134");
    const project = screen.getByRole("region", { name: "Project details" });
    expect(project).toHaveTextContent("Shutters");
    expect(project).toHaveTextContent("Mid-range");
    expect(screen.getByText("Schedule the install")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Money" })).toHaveTextContent("$2,500");
  });

  it("shows set values and empty states on the status cards", () => {
    render(<OverviewTab {...base} />);
    expect(screen.getByRole("region", { name: "Order" })).toHaveTextContent("Sep 18, 2026");
    const install = screen.getByRole("region", { name: "Install" });
    expect(install).toHaveTextContent("Not scheduled");
    expect(within(install).getByRole("link", { name: "Set install date" })).toHaveAttribute(
      "href", `/admin/jobs/${ID}?tab=overview&edit=details#installOn`,
    );
    expect(screen.getByRole("region", { name: "Visit" })).toHaveTextContent("No visit booked");
  });

  it("swaps the money and status cards for the details form in edit mode", () => {
    render(<OverviewTab {...base} editing />);
    expect(screen.getByRole("button", { name: /save details/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", `/admin/jobs/${ID}`);
    expect(screen.queryByRole("region", { name: "Money" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Install" })).toBeNull();
  });

  it("shows empty activity and files with links to their tabs", () => {
    render(<OverviewTab {...base} />);
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
    expect(screen.getByText("No files yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload" })).toHaveAttribute("href", `/admin/jobs/${ID}?tab=files`);
  });

  it("excludes window measurement photos from the overview thumbnails", () => {
    const windowPhoto = { id: "photo-1", leadId: ID, kind: "photo" as const, name: "window.jpg", contentType: "image/jpeg", blobPathname: "photo-1", createdAt: now, sizeBytes: 100, uploadedBy: "x", sharedAt: null };
    const generalPhoto = { id: "photo-2", leadId: ID, kind: "photo" as const, name: "before.jpg", contentType: "image/jpeg", blobPathname: "photo-2", createdAt: now, sizeBytes: 100, uploadedBy: "x", sharedAt: null };
    render(<OverviewTab {...base}
      files={[windowPhoto, generalPhoto]}
      measurements={[{
        id: "m1", jobId: ID, room: "Kitchen", label: null, widthEighths: 280, heightEighths: 384,
        depthEighths: null, mount: "inside", requirements: [], notes: null, photoFileId: "photo-1",
        updatedAt: now,
      } as unknown as import("@/lib/admin/measurements").WindowMeasurement]}
    />);
    expect(screen.getByRole("link", { name: "before.jpg" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "window.jpg" })).toBeNull();
  });

  it("shows Review request and Referral link once sold", () => {
    render(<OverviewTab {...base} job={{ ...job, status: "sold" }} />);
    expect(screen.getByRole("region", { name: "Review request" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Referral link" })).toBeInTheDocument();
  });

  it("hides Review request and Referral link before sold", () => {
    render(<OverviewTab {...base} job={{ ...job, status: "quoted" }} />);
    expect(screen.queryByRole("region", { name: "Review request" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Referral link" })).toBeNull();
  });
});
