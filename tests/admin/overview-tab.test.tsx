import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(), markLost: vi.fn(async () => ({})), saveDetails: vi.fn(async () => ({})),
  saveNote: vi.fn(async () => ({})), sendPortalInviteNow: vi.fn(), sendReviewNow: vi.fn(),
  saveReviewOptOut: vi.fn(), createReferralLink: vi.fn(), payReferral: vi.fn(),
  assignJobAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/admin/jobs/appointment-actions", () => ({
  bookAppointment: vi.fn(async () => ({})), confirmSchedule: vi.fn(async () => ({})),
  cancelAppointmentAction: vi.fn(async () => ({})),
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
const base = {
  job, editing: false, now, measurements: [], files: [], events: [], referrals: [], referrer: null,
  appointments: [], defaultMinutes: { consultation: 60, measure: 60, install: 240, service: 90 },
};

describe("OverviewTab", () => {
  it("shows the customer and project, and no money strip", () => {
    render(<OverviewTab {...base} />);
    expect(screen.getByRole("region", { name: "Customer" })).toHaveTextContent("(702) 555-0134");
    const project = screen.getByRole("region", { name: "Project details" });
    expect(project).toHaveTextContent("Shutters");
    expect(project).toHaveTextContent("Mid-range");
    expect(screen.queryByRole("region", { name: "Money" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Next action" })).toBeNull();
  });

  it("puts the appointments where the visit and install cards were", () => {
    render(<OverviewTab {...base} />);
    expect(screen.getByRole("region", { name: "Appointments" })).toHaveTextContent("Nothing scheduled");
    expect(screen.queryByRole("region", { name: "Visit" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Install" })).toBeNull();
  });

  it("reports the order without offering to edit it", () => {
    render(<OverviewTab {...base} />);
    const order = screen.getByRole("region", { name: "Order" });
    expect(order).toHaveTextContent("Ordered Sep 18, 2026");
    expect(order).toHaveTextContent("Hunter Douglas");
    expect(within(order).queryByRole("link", { name: /order date/i })).toBeNull();
    expect(within(order).queryByRole("button")).toBeNull();

    render(<OverviewTab {...base} job={{ ...job, orderedOn: null }} />);
    expect(screen.getAllByRole("region", { name: "Order" })[1]).toHaveTextContent("Not ordered");
  });

  it("links the order paperwork once a document is attached", () => {
    const doc = {
      id: "doc-1", leadId: ID, kind: "document" as const, name: "order.pdf", contentType: "application/pdf",
      blobPathname: "doc-1", createdAt: now, sizeBytes: 100, uploadedBy: "x", sharedAt: null,
    };
    render(<OverviewTab {...base} files={[doc]} />);
    const order = screen.getByRole("region", { name: "Order" });
    expect(within(order).getByRole("link", { name: "Order paperwork" })).toHaveAttribute("href", "/admin/files/doc-1");
  });

  it("counts measured windows, not saved lines", () => {
    const line = {
      id: "w", leadId: ID, position: 1, room: "Den", label: null, widthEighths: 240, heightEighths: 320,
      depthEighths: null, mount: "inside" as const, requirements: [], notes: null, photoFileId: null,
      measuredBy: "x", createdAt: now, updatedAt: now,
    };
    render(<OverviewTab {...base} measurements={[{ ...line, quantity: 10 }, { ...line, id: "v", quantity: 2 }]} />);
    expect(screen.getByRole("region", { name: "Measurements" })).toHaveTextContent("12 windows");
  });

  it("keeps Add measurement on the Measurements card", () => {
    render(<OverviewTab {...base} />);
    const measurements = screen.getByRole("region", { name: "Measurements" });
    expect(measurements).toHaveTextContent("No windows measured yet");
    expect(within(measurements).getByRole("link", { name: "Add measurement" })).toHaveAttribute(
      "href", `/admin/jobs/${ID}/measure`,
    );
  });

  it("swaps the status cards for the details form in edit mode", () => {
    render(<OverviewTab {...base} editing />);
    expect(screen.getByRole("button", { name: /save details/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", `/admin/jobs/${ID}`);
    expect(screen.queryByRole("region", { name: "Appointments" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Order" })).toBeNull();
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
