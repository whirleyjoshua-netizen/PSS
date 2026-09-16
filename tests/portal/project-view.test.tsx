import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const listSharedPhotos = vi.fn();
const listSharedDocuments = vi.fn();
vi.mock("@/lib/admin/files", () => ({ listSharedPhotos, listSharedDocuments }));
const ensureReferralCode = vi.fn();
vi.mock("@/lib/referrals/db", () => ({ ensureReferralCode }));
const countReferred = vi.fn();
vi.mock("@/lib/portal/project", () => ({ countReferred }));
const stageDates = vi.fn();
const lastMeasuredAt = vi.fn();
const installAppointmentAt = vi.fn();
vi.mock("@/lib/portal/timeline", () => ({ stageDates, lastMeasuredAt, installAppointmentAt }));
vi.mock("@/app/(site)/project/actions", () => ({ signOutCustomer: vi.fn(), sendMessageAction: vi.fn() }));
const listMessages = vi.fn();
vi.mock("@/lib/portal/messages", () => ({ listMessages }));

const { ProjectView } = await import("@/app/(site)/project/ProjectView");
const { FilesTabs } = await import("@/app/(site)/project/FilesTabs");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job = {
  id: JOB, createdAt: new Date(), name: "Maria Lopez", phone: "7025550100", email: "maria@example.com",
  address: "12 Palm Way", city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: "Gate code 1234", source: "website", status: "ordered" as const, stageChangedAt: new Date(),
  visitAt: null, quoteCents: 450000, soldCents: 420000, depositCents: 100000, brands: ["Hunter Douglas"],
  orderedOn: "2025-09-20", installOn: null, lostReason: null, referralCode: null, referredBy: null,
  referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
  projectNo: 1048, windowCountExact: 9, treatmentTypes: ["shutters" as const], finish: "designer" as const,
  gateCode: "8812#", budgetTier: "premium" as const,
};

const quoteDoc = { id: "d1", name: "Quote-1048.pdf", docType: "quote" as const };
const otherDoc = { id: "d2", name: "Care-guide.pdf", docType: null };

beforeEach(() => {
  listSharedPhotos.mockReset().mockResolvedValue([{ id: "p1", name: "Living room.jpg" }]);
  listSharedDocuments.mockReset().mockResolvedValue([]);
  ensureReferralCode.mockReset().mockResolvedValue("K7QX2M");
  countReferred.mockReset().mockResolvedValue(2);
  stageDates.mockReset().mockResolvedValue({ sold: new Date("2025-09-18T17:00:00Z") });
  lastMeasuredAt.mockReset().mockResolvedValue(new Date("2025-09-08T17:00:00Z"));
  installAppointmentAt.mockReset().mockResolvedValue(null);
  listMessages.mockReset().mockResolvedValue([]);
});

describe("ProjectView header and tracker", () => {
  it("greets the customer with the address and the project number", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hi Maria");
    expect(screen.getByText("12 Palm Way, Henderson")).toBeInTheDocument();
    expect(screen.getByText("PSS-1048")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("shows where the job is, with its dates", async () => {
    render(await ProjectView({ job }));
    const tracker = screen.getByRole("region", { name: "Your project" });
    // Ordered with no install booked: In Production is the furthest step reached, so it is the
    // current one, Order Confirmed behind it reads done, and Ready to Install is still ahead.
    const current = within(tracker).getByText("In Production").closest("li")!;
    expect(current).toHaveAttribute("aria-current", "step");
    expect(within(current).getByText("Sep 20, 2025")).toBeInTheDocument();
    expect(within(tracker).getByText("Order Confirmed").closest("li")!).not.toHaveAttribute("aria-current");
    expect(within(tracker).getByText("Ready to Install").closest("li")!).not.toHaveAttribute("aria-current");
  });

  it("dates Measurements and Ready to Install from the loaded timeline", async () => {
    installAppointmentAt.mockResolvedValue(new Date("2099-10-13T17:00:00Z"));
    render(await ProjectView({ job }));
    expect(lastMeasuredAt).toHaveBeenCalledWith(JOB);
    expect(installAppointmentAt).toHaveBeenCalledWith(JOB);

    const tracker = screen.getByRole("region", { name: "Your project" });
    const measured = within(tracker).getByText("Measurements").closest("li")!;
    expect(within(measured).getByText("Sep 8, 2025")).toBeInTheDocument();
  });

  it("reads a still-to-come date under a tick as scheduled, not as done", async () => {
    installAppointmentAt.mockResolvedValue(new Date("2099-10-13T17:00:00Z"));
    render(await ProjectView({ job }));
    const tracker = screen.getByRole("region", { name: "Your project" });
    const ready = within(tracker).getByText("Ready to Install").closest("li")!;
    expect(within(ready).getByText("Scheduled Oct 13, 2099")).toBeInTheDocument();
    // A date that has already passed stays bare, and carries its year because it is not this year.
    expect(within(within(tracker).getByText("In Production").closest("li")!).getByText("Sep 20, 2025")).toBeInTheDocument();
  });
});

describe("ProjectView status banner", () => {
  it("is informational when no quote has been shared", async () => {
    render(await ProjectView({ job }));
    const banner = screen.getByRole("region", { name: "Where your project stands" });
    expect(within(banner).getByRole("heading", { level: 2 })).toHaveTextContent("In Production");
    expect(within(banner).queryByRole("link", { name: "Review quote" })).not.toBeInTheDocument();
  });

  it("offers Review quote when a shared quote document exists", async () => {
    listSharedDocuments.mockResolvedValue([quoteDoc]);
    render(await ProjectView({ job }));
    const banner = screen.getByRole("region", { name: "Where your project stands" });
    expect(within(banner).getByRole("link", { name: "Review quote" })).toHaveAttribute("href", "/project/files/d1");
  });

  // The completed-job case: every step is reached, so nothing is "current" — the tracker is all
  // ticks and the banner falls back to the last step done. A finished job should read finished.
  it("reads a finished job as complete, with nothing still in progress", async () => {
    render(await ProjectView({ job: { ...job, status: "completed" as const, installOn: "2025-10-13" } }));

    const banner = screen.getByRole("region", { name: "Where your project stands" });
    expect(within(banner).getByRole("heading", { level: 2 })).toHaveTextContent("Installed");
    expect(within(banner).getByText("Your installation is complete. Enjoy your new windows.")).toBeInTheDocument();

    const tracker = screen.getByRole("region", { name: "Your project" });
    expect(tracker.querySelectorAll('li[aria-current="step"]')).toHaveLength(0);
  });

  // The banner and the Installation section describe the same job, so they must never
  // disagree. A finished job's install_on is in the past: promising to call and confirm it
  // would contradict the banner's "your installation is complete" on the same page.
  it.each(["installed", "completed"] as const)("reads a %s job's installation as finished", async (status) => {
    render(await ProjectView({ job: { ...job, status, installOn: "2025-10-13" } }));

    const banner = screen.getByRole("region", { name: "Where your project stands" });
    expect(within(banner).getByText("Your installation is complete. Enjoy your new windows.")).toBeInTheDocument();

    const install = screen.getByRole("region", { name: "Installation" });
    expect(within(install).getByText(/Your installation was completed on Oct 13, 2025/)).toBeInTheDocument();
    expect(within(install).getByText(/call us and we will come back out/)).toBeInTheDocument();
    expect(within(install).queryByText(/booked for/)).not.toBeInTheDocument();
    expect(within(install).queryByText(/We will be in touch to confirm/)).not.toBeInTheDocument();
    expect(within(install).queryByText(/not booked yet/)).not.toBeInTheDocument();
  });

  it("says a finished job is complete even with no install date recorded", async () => {
    render(await ProjectView({ job: { ...job, status: "completed" as const, installOn: null } }));
    const install = screen.getByRole("region", { name: "Installation" });
    expect(within(install).getByText(/Your installation is complete\./)).toBeInTheDocument();
    expect(within(install).queryByText(/booked for/)).not.toBeInTheDocument();
  });
});

describe("ProjectView details and updates", () => {
  it("shows what was ordered, and no install date until one is booked", async () => {
    render(await ProjectView({ job }));
    const details = screen.getByRole("region", { name: "Project details" });
    expect(within(details).getByText("9")).toBeInTheDocument();
    expect(within(details).getByText("Shutters")).toBeInTheDocument();
    expect(within(details).getByText("Designer")).toBeInTheDocument();
    expect(within(details).getByText("Not scheduled yet")).toBeInTheDocument();
  });

  // A tick claims the work happened. This job was quoted off the consultation with no
  // measurement saved, so Measurements is behind the customer but must not be ticked.
  it("does not tick a step whose work was never done", async () => {
    lastMeasuredAt.mockResolvedValue(null);
    render(await ProjectView({ job: { ...job, status: "quoted" as const } }));

    const tracker = screen.getByRole("region", { name: "Your project" });
    const measurements = within(tracker).getByText("Measurements").closest("li")!;
    expect(within(measurements).getByText("(not yet)")).toBeInTheDocument();
    expect(within(measurements).queryByText("(done)")).not.toBeInTheDocument();

    // A step that did happen still reads as done.
    expect(within(within(tracker).getByText("Consultation").closest("li")!).getByText("(done)")).toBeInTheDocument();
  });

  it("promises to call about the installation when none is booked", async () => {
    render(await ProjectView({ job }));
    const install = screen.getByRole("region", { name: "Installation" });
    expect(within(install).getByText(/We will call you to arrange a day/)).toBeInTheDocument();
  });

  it("gives the booked installation its own section once one is confirmed", async () => {
    installAppointmentAt.mockResolvedValue(new Date("2099-10-13T17:00:00Z"));
    render(await ProjectView({ job }));
    const install = screen.getByRole("region", { name: "Installation" });
    expect(within(install).getByText(/Your installation is booked for Oct 13, 2099/)).toBeInTheDocument();
  });

  it("lists updates from fixed labels, never an event body", async () => {
    render(await ProjectView({ job }));
    const updates = screen.getByRole("region", { name: "Project updates" });
    expect(within(updates).getByText("Your order was confirmed.")).toBeInTheDocument();
    expect(within(updates).getByText("Sep 18, 2025")).toBeInTheDocument();
  });
});

describe("ProjectView photos and documents", () => {
  it("puts photos and documents in real tabs", async () => {
    listSharedDocuments.mockResolvedValue([quoteDoc]);
    render(await ProjectView({ job }));
    const photos = screen.getByRole("tab", { name: "Photos" });
    const documents = screen.getByRole("tab", { name: "Documents" });
    expect(photos).toHaveAttribute("aria-selected", "true");
    expect(documents).toHaveAttribute("aria-selected", "false");
  });

  it("shows only shared photos, through the customer route", async () => {
    render(await ProjectView({ job }));
    expect(listSharedPhotos).toHaveBeenCalledWith(JOB);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/project/files/p1");
  });

  it("lists shared documents with their type label and a download link", async () => {
    listSharedDocuments.mockResolvedValue([quoteDoc, otherDoc]);
    render(await ProjectView({ job }));
    expect(listSharedDocuments).toHaveBeenCalledWith(JOB);
    // The Documents panel is the unselected tab, so it is in the DOM but hidden from the role tree.
    expect(screen.getByText("Quote-1048.pdf").closest("a")).toHaveAttribute("href", "/project/files/d1");
    expect(screen.getByText("Quote")).toBeInTheDocument();
    expect(screen.getByText("Document")).toBeInTheDocument();
  });

  it("shows an empty state for each tab", async () => {
    listSharedPhotos.mockResolvedValue([]);
    render(await ProjectView({ job }));
    expect(screen.getByText("Photos from your install will appear here.")).toBeInTheDocument();
    expect(screen.getByText("Paperwork we share with you will appear here.")).toBeInTheDocument();
  });

  it("renders both panels, and no tab strip, without JavaScript", () => {
    const html = renderToStaticMarkup(
      <FilesTabs photos={<p>photo panel</p>} documents={<p>document panel</p>} />,
    );
    expect(html).toContain("photo panel");
    expect(html).toContain("document panel");
    expect(html).not.toContain("aria-selected");
    // The attribute itself, not merely the word: neither panel may be hidden without JavaScript.
    expect(html).not.toMatch(/\bhidden(=|\s|>)/);
  });
});

describe("ProjectView keeps everything internal off the page", () => {
  it("never shows notes, the gate code, the lost reason, money or brands", async () => {
    const lost = { ...job, notes: "Gate code 1234, dog in the yard", gateCode: "8812#", lostReason: "went with a competitor" };
    const { container } = render(await ProjectView({ job: lost }));
    const text = container.textContent ?? "";
    // Positive anchor: the page really rendered its own content, so the absences below mean something.
    expect(text).toContain("Hi Maria");
    expect(text).toContain("PSS-1048");

    for (const secret of ["Gate code 1234", "dog in the yard", "8812#", "went with a competitor", "Hunter Douglas", "premium"]) {
      expect(text).not.toContain(secret);
    }
    expect(text.replace("$100", "")).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/4,500|4,200|1,000/);
    // Money would leak as raw cents if a field were ever passed through unformatted,
    // with no dollar sign or comma for the checks above to catch.
    expect(text).not.toMatch(/450000|420000|100000/);
    expect(text).not.toContain(JOB);
  });
});

describe("ProjectView referral and contact", () => {
  it("gives the referral link and count", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByText("https://premiershadesolutions.com/r/K7QX2M")).toBeInTheDocument();
    expect(screen.getByText("Friends referred so far: 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("lets the customer contact us", async () => {
    render(await ProjectView({ job }));
    expect(screen.getByRole("link", { name: "(725) 400-5254" })).toHaveAttribute("href", "tel:+17254005254");
  });
});
