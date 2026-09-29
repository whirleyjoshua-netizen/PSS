import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { business } from "@/content/business";

const listSharedPhotos = vi.fn();
const listSharedDocuments = vi.fn();
vi.mock("@/lib/admin/files", () => ({ listSharedPhotos, listSharedDocuments }));
const ensureReferralCode = vi.fn();
vi.mock("@/lib/referrals/db", () => ({ ensureReferralCode }));
const countReferred = vi.fn();
// Empty unless a test says otherwise: most jobs have never had a service requested.
const listServiceRequests = vi.fn(async () => [] as { at: Date; projectNo: number | null }[]);
vi.mock("@/lib/portal/project", () => ({ countReferred, listServiceRequests }));
const stageDates = vi.fn();
const lastMeasuredAt = vi.fn();
const installAppointmentAt = vi.fn();
vi.mock("@/lib/portal/timeline", () => ({ stageDates, lastMeasuredAt, installAppointmentAt }));
// acknowledgeInstallFormAction is reached by the banner's acknowledgement on an installed job.
vi.mock("@/app/(site)/project/actions", () => ({
  signOutCustomer: vi.fn(),
  sendMessageAction: vi.fn(),
  acknowledgeInstallFormAction: vi.fn(),
  signContractFormAction: vi.fn(),
  acknowledgeDocumentFormAction: vi.fn(),
}));
const listMessages = vi.fn();
vi.mock("@/lib/portal/messages", () => ({ listMessages }));
const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
// No contracts to sign unless a test says otherwise.
const signableContracts = vi.fn(async () => [] as { id: string; name: string }[]);
const listSignatures = vi.fn(async () => [] as { signedAt: Date; fileId: string; signedFileId?: string | null }[]);
vi.mock("@/lib/portal/sign", () => ({ signableContracts, listSignatures }));
// Nothing to acknowledge and no guides unless a test says otherwise.
const acknowledgeableDocuments = vi.fn(async () => [] as { id: string; title: string; file: { id: string; name: string } }[]);
const acknowledgementFor = vi.fn(async () => null as { leadId: string; acknowledgedAt: Date } | null);
vi.mock("@/lib/portal/acknowledge-document", () => ({ acknowledgeableDocuments, acknowledgementFor }));
const liveTemplateOfKind = vi.fn(async (_kind: string) => null as { body: string } | null);
vi.mock("@/lib/docs/templates", () => ({ liveTemplateOfKind }));

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
  requireCustomer.mockReset().mockResolvedValue({ email: "maria@example.com", jobs: [job] });
  signableContracts.mockReset().mockResolvedValue([]);
  acknowledgeableDocuments.mockReset().mockResolvedValue([]);
  acknowledgementFor.mockReset().mockResolvedValue(null);
  liveTemplateOfKind.mockReset().mockResolvedValue(null);
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

  /**
   * Spec §5: the acknowledgement appears at `installed` and NEVER at `completed` — once they
   * have answered, the question is answered.
   *
   * This pair is the guard on a trap. toPortalStage folds `completed` into `installed`, so the
   * project's own status reads "installed" for BOTH, and gating on it — the obvious thing to
   * write, and what every other section on this page does — would keep asking a customer
   * whether their installation is right after they have already confirmed it, with a button
   * that can no longer do anything. Only the job's raw status can tell the two apart, and the
   * completed case below is what fails if anyone "simplifies" it back.
   */
  const QUESTION = "Is everything how you wanted it?";

  it("asks whether everything is right once the job is installed", async () => {
    render(await ProjectView({ job: { ...job, status: "installed" as const, installOn: "2025-10-13" } }));
    const banner = screen.getByRole("region", { name: "Where your project stands" });
    expect(within(banner).getByText(QUESTION)).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "Yes, everything looks great" })).toBeInTheDocument();
    expect(within(banner).getByRole("link", { name: "Something is not right" })).toHaveAttribute(
      "href",
      `/project/${JOB}/service?from=acknowledgement`,
    );
  });

  it("stops asking once the customer has confirmed it, though the page still reads Installed", async () => {
    render(await ProjectView({ job: { ...job, status: "completed" as const, installOn: "2025-10-13" } }));
    const banner = screen.getByRole("region", { name: "Where your project stands" });
    // The customer never reads the word Completed — the fold is intact...
    expect(within(banner).getByRole("heading", { level: 2 })).toHaveTextContent("Installed");
    // ...and yet the question is gone, which only the raw status can decide.
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.queryByRole("button", { name: "Yes, everything looks great" })).toBeNull();
  });

  it.each(["quoted", "sold", "ordered"] as const)("does not ask while the job is only %s", async (status) => {
    render(await ProjectView({ job: { ...job, status } }));
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it("says a finished job is complete even with no install date recorded", async () => {
    render(await ProjectView({ job: { ...job, status: "completed" as const, installOn: null } }));
    const install = screen.getByRole("region", { name: "Installation" });
    expect(within(install).getByText(/Your installation is complete\./)).toBeInTheDocument();
    expect(within(install).queryByText(/booked for/)).not.toBeInTheDocument();
  });
});

/**
 * The wiring, not the sentence: the flag the redirect puts on the URL must actually reach the
 * notice, with the job's real status beside it. ApprovalNotice's own tests cover what it says.
 */
describe("ProjectView after approving", () => {
  it("confirms the approval on the page they land back on", async () => {
    render(await ProjectView({ job: { ...job, status: "sold" as const }, justApproved: "1" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Thank you — we have your approval and will be in touch to arrange the details.",
    );
  });

  // The page must hand the notice the job's status, not just the flag: if it passed the flag
  // alone, a crafted URL would confirm an approval on a job still waiting to be approved.
  it("confirms nothing when the URL claims an approval the job does not show", async () => {
    render(await ProjectView({ job: { ...job, status: "quoted" as const }, justApproved: "1" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says nothing on an ordinary visit", async () => {
    render(await ProjectView({ job: { ...job, status: "sold" as const } }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ProjectView contract signing", () => {
  beforeEach(() => {
    signableContracts.mockReset().mockResolvedValue([]);
    listSignatures.mockReset().mockResolvedValue([]);
  });

  it("offers one signing form per signable contract, from the helper the action uses", async () => {
    signableContracts.mockResolvedValue([{ id: "c1", name: "Contract-1048.pdf" }]);
    render(await ProjectView({ job }));
    expect(signableContracts).toHaveBeenCalledWith(JOB);
    expect(screen.getAllByLabelText("Your full name")).toHaveLength(1);
  });

  it("offers no form when nothing is left to sign", async () => {
    render(await ProjectView({ job }));
    expect(screen.queryByLabelText("Your full name")).toBeNull();
  });

  it("confirms a signing only against a recorded signature", async () => {
    render(await ProjectView({ job, justSigned: "1", justSignedFile: "c1" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  // Two contracts: A is signed, B was refused. The notice speaks about B, not the job's latest.
  it("shows the refusal for contract B even though contract A is signed", async () => {
    listSignatures.mockResolvedValue([{ signedAt: new Date("2026-09-18T17:00:00Z"), fileId: "A" }]);
    render(await ProjectView({ job, justSigned: "no", justSignedFile: "B" }));
    expect(screen.getByRole("status")).toHaveTextContent("We could not record that signature just now.");
  });

  it("thanks nobody for a forged hint on B while only A is signed", async () => {
    listSignatures.mockResolvedValue([{ signedAt: new Date("2026-09-18T17:00:00Z"), fileId: "A" }]);
    render(await ProjectView({ job, justSigned: "1", justSignedFile: "B" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("confirms a recorded signature on the page they land back on", async () => {
    listSignatures.mockResolvedValue([{ signedAt: new Date("2026-09-18T17:00:00Z"), fileId: "c1" }]);
    render(await ProjectView({ job, justSigned: "1", justSignedFile: "c1" }));
    expect(listSignatures).toHaveBeenCalledWith(JOB);
    expect(screen.getByRole("status")).toHaveTextContent("Thank you — your contract was signed on");
  });

  it("names the job document it lands back on, and offers it to sign as a document", async () => {
    listSignatures.mockResolvedValue([{ signedAt: new Date("2026-09-18T17:00:00Z"), fileId: "c1", documentTitle: "Change order — PSS-1048" } as never]);
    signableContracts.mockResolvedValue([{ id: "c2", name: "Service agreement — PSS-1048.pdf", document: { title: "Service agreement — PSS-1048", kind: "service_agreement" } } as never]);
    render(await ProjectView({ job, justSigned: "1", justSignedFile: "c1" }));
    expect(screen.getByRole("status")).toHaveTextContent("Thank you — you signed “Change order — PSS-1048” on Sep 18, 2026.");
    expect(screen.getByText("Sign this document", { selector: "summary" })).toBeInTheDocument();
  });

  // The lasting record: an ordinary visit, no ?signed hint at all.
  it("keeps a Signed line with a download link once the stamped copy exists", async () => {
    listSharedDocuments.mockResolvedValue([{ id: "c1", name: "Contract-1048.pdf", docType: "contract" }]);
    listSignatures.mockResolvedValue([
      { signedAt: new Date("2026-09-18T17:00:00Z"), fileId: "c1", signedFileId: "s1" },
    ]);
    render(await ProjectView({ job }));
    const signed = screen.getByRole("region", { name: "Signed" });
    // 17:00 UTC is 10:00 AM in Las Vegas (PDT).
    expect(signed).toHaveTextContent("Signed on");
    expect(signed).toHaveTextContent("10:00 AM");
    expect(signed).toHaveTextContent("Contract-1048.pdf");
    expect(within(signed).getByRole("link", { name: "Download the signed copy" })).toHaveAttribute(
      "href",
      "/project/files/s1",
    );
  });

  it("still reads Signed when stamping failed, with no link to a copy that does not exist", async () => {
    listSignatures.mockResolvedValue([
      { signedAt: new Date("2026-09-18T17:00:00Z"), fileId: "c1", signedFileId: null },
    ]);
    render(await ProjectView({ job }));
    const signed = screen.getByRole("region", { name: "Signed" });
    expect(signed).toHaveTextContent("Signed on");
    expect(within(signed).queryByRole("link")).toBeNull();
  });

  it("shows no Signed line until a signature exists", async () => {
    signableContracts.mockResolvedValue([{ id: "c1", name: "Contract-1048.pdf" }]);
    render(await ProjectView({ job }));
    expect(screen.queryByRole("region", { name: "Signed" })).toBeNull();
    expect(screen.queryByText(/Signed on/)).toBeNull();
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

describe("ProjectView after the work is done", () => {
  // The wiring, not the component: the section must actually reach the page, and only
  // for a finished job. Both portal statuses a finished job can have are covered.
  it.each(["installed", "completed"] as const)("offers a review link on a %s job", async (status) => {
    render(await ProjectView({ job: { ...job, status, installOn: "2025-10-13" } }));
    const section = screen.getByRole("region", { name: "After the work is done" });
    expect(within(section).getByRole("link", { name: "Leave a review" })).toHaveAttribute(
      "href",
      business.socials.googleBusinessProfile,
    );
  });

  it("stays off the page while the work is still in production", async () => {
    render(await ProjectView({ job }));
    expect(screen.queryByRole("region", { name: "After the work is done" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Leave a review" })).not.toBeInTheDocument();
  });

  // Opting out of the review email is not opting out of reviewing. The flag suppresses
  // what we send them; it must not remove an action from a page they opened themselves.
  it("still offers the link to a customer who opted out of the review email", async () => {
    render(await ProjectView({ job: { ...job, status: "installed" as const, reviewOptOut: true } }));
    expect(screen.getByRole("link", { name: "Leave a review" })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "(702) 859-8294" })).toHaveAttribute("href", "tel:+17028598294");
  });
});

describe("Needs your attention", () => {
  it("lists documents to sign and to acknowledge at the top", async () => {
    signableContracts.mockResolvedValue([{ id: "c1", name: "Change order — PSS-1048.pdf" }]);
    acknowledgeableDocuments.mockResolvedValue([{ id: "d1", title: "Service agreement — PSS-1048", file: { id: "f1", name: "SA.pdf" } }]);
    render(await ProjectView({ job }));
    const region = screen.getByRole("region", { name: "Needs your attention" });
    expect(within(region).getByRole("heading", { name: "Documents to sign" })).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "Documents to acknowledge" })).toBeInTheDocument();
    expect(within(region).getByText("I have read Service agreement — PSS-1048")).toBeInTheDocument();
    // Signing first: it is the more consequential of the two.
    expect(within(region).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Documents to sign", "Documents to acknowledge"]);
    expect(screen.queryByRole("heading", { name: "Your contract" })).toBeNull();
    // At the top: before the tracker.
    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-labelledby"));
    expect(regions.indexOf("attention-heading")).toBeLessThan(regions.indexOf("progress-heading"));
  });
  it("is absent when nothing waits", async () => {
    render(await ProjectView({ job }));
    expect(screen.queryByRole("region", { name: "Needs your attention" })).toBeNull();
  });
  it("confirms an acknowledgement only when it is this job's", async () => {
    acknowledgementFor.mockResolvedValue({ leadId: JOB, acknowledgedAt: new Date("2026-09-28T19:00:00Z") });
    const { unmount } = render(await ProjectView({ job, justDocAck: "1", justSignedFile: "22222222-2222-4222-8222-222222222222" }));
    expect(screen.getByRole("status")).toHaveTextContent("Thank you — your acknowledgement was recorded on Sep 28, 2026.");
    unmount();
    acknowledgementFor.mockResolvedValue({ leadId: "another-job", acknowledgedAt: new Date() });
    render(await ProjectView({ job, justDocAck: "1", justSignedFile: "22222222-2222-4222-8222-222222222222" }));
    expect(screen.queryByText(/your acknowledgement was recorded/)).toBeNull();
  });
});

describe("portal guides", () => {
  const guides = async (kind: string) =>
    kind === "guide_install" ? { body: "## Before we arrive\n\n- Clear the sills" } : { body: "Dust weekly with a **soft** cloth." };
  it("shows the install guide on an ordered job, rendered from the template", async () => {
    liveTemplateOfKind.mockImplementation(guides);
    render(await ProjectView({ job }));
    const region = screen.getByRole("region", { name: "Getting ready for your install" });
    expect(within(region).getByRole("heading", { name: "Before we arrive" })).toBeInTheDocument();
    expect(within(region).getByText("Clear the sills")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Caring for your shades" })).toBeNull();
    expect(liveTemplateOfKind).toHaveBeenCalledWith("guide_install");
    expect(liveTemplateOfKind).not.toHaveBeenCalledWith("guide_care");
  });
  it("adds the care guide once installed", async () => {
    liveTemplateOfKind.mockImplementation(guides);
    render(await ProjectView({ job: { ...job, status: "installed" as const } }));
    expect(within(screen.getByRole("region", { name: "Caring for your shades" })).getByText("soft")).toBeInTheDocument();
  });
  it("loads no guide a sold job with nothing booked cannot show", async () => {
    render(await ProjectView({ job: { ...job, status: "sold" as const } }));
    expect(liveTemplateOfKind).not.toHaveBeenCalled();
  });
});
