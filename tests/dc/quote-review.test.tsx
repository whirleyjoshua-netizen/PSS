import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Review } from "@/lib/dc/send";
import type { StoredLine, StoredVersion } from "@/lib/dc/store";
import { DC_NEW_QUOTE_URL, dcQuoteUrl } from "@/lib/dc/links";

const setLinePctAction = vi.fn();
const setChoicesAction = vi.fn();
const sendContractAction = vi.fn();
const checkNowAction = vi.fn();
vi.mock("@/app/admin/jobs/[id]/quote-actions", () => ({ setLinePctAction, setChoicesAction, sendContractAction, checkNowAction }));
const loadReview = vi.fn();
vi.mock("@/lib/dc/send", () => ({ loadReview }));

const { QuoteReview } = await import("@/app/admin/jobs/[id]/QuoteReview");
const { DcButtons, CheckNowButton } = await import("@/app/admin/jobs/[id]/DcButtons");
const { QuoteTab } = await import("@/app/admin/jobs/[id]/QuoteTab");

const J = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const V = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const FP = "FP-the-one-send-compares";

const line = (position: number, over: Partial<StoredLine>): StoredLine => ({
  position, qty: 1, room: "Kitchen", description: "Hunter Douglas Duette Honeycomb Shades", collection: "Duette",
  baseCents: 0, promotionCents: 0, optionsCents: 0, msrpUnitCents: 65500, costFactor: "0.4940", costUnitCents: 32357,
  costExtendedCents: 32357, options: [], pctOverride: null, markupPct: null,
  // Stale stored figures: the screen must never show these, only review.priced.
  sellUnitCents: 11111, markupOverridden: false, ...over,
});

const LINES: StoredLine[] = [
  line(1, { options: [["Order Width", "36"], ["Order Height", "48"], ["Mount Type", "Inside"], ["Color", "White"]] }),
  line(2, { qty: 2, room: "Primary Bedroom", description: "Hunter Douglas Silhouette", collection: "Silhouette", msrpUnitCents: 80000, costExtendedCents: 79040, pctOverride: 55 }),
  line(3, { room: "", description: "Hunter Douglas PowerView Gateway", collection: "PowerView", msrpUnitCents: 20000, costExtendedCents: 9880 }),
];

const version = (over: Partial<StoredVersion> = {}): StoredVersion => ({
  id: V, leadId: J, version: 2, dcQuoteNo: "12345678", poReference: "PSS-1042", sourceFileId: "file-1", sourceSha256: "x",
  status: "draft", subtotalCents: 0, handlingFeeCents: 2500, oversizedFeeCents: 0, dealerTotalCents: 121277,
  waiveHandling: false, noInstall: false, installQuoteId: null, installCents: null, productsCents: null, clientTotalCents: null,
  contractFileId: null, sentAt: null, signedAt: null, createdAt: new Date("2026-09-20T18:00:00Z"), lines: LINES, ...over,
});

/** Odd-cent figures no recomputation from the lines would land on, so each one on screen came from here. */
const review = (over: Partial<Review> = {}): Review => ({
  version: version(),
  priced: {
    lines: [
      { position: 1, pct: 60, source: "rule", sellUnitCents: 39301, sellExtendedCents: 39301, marginCents: 6944 },
      { position: 2, pct: 55, source: "override", sellUnitCents: 44003, sellExtendedCents: 88006, marginCents: 8966 },
      { position: 3, pct: 50, source: "rule", sellUnitCents: 10007, sellExtendedCents: 10007, marginCents: 127 },
    ],
    productsCents: 137314, handlingChargedCents: 2507, oversizedCents: 0, installCents: 45013, installQuoteId: "iq-1",
    clientTotalCents: 184834, costCents: 121279, marginCents: 18542, waiveHandling: false, blockers: [],
  },
  blockers: [], fingerprint: FP,
  install: { id: "iq-1", kind: "final", totalCents: 45013, createdAt: new Date("2026-09-20T18:00:00Z") },
  rules: { Duette: 60, Silhouette: 57.5, PowerView: 50 }, olderVersions: [], ...over,
});

const row = (name: RegExp) => screen.getByRole("row", { name });
const total = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement!.querySelector("dd")!;

beforeEach(() => {
  vi.clearAllMocks();
  setLinePctAction.mockResolvedValue({});
  setChoicesAction.mockResolvedValue({});
  sendContractAction.mockResolvedValue({ ok: true, emailed: true });
  checkNowAction.mockResolvedValue({ message: "No new Dealer Copies." });
});

describe("QuoteReview figures", () => {
  it("shows every sell, margin and total from review.priced, never the stored line figures", () => {
    render(<QuoteReview jobId={J} review={review()} />);
    const kitchen = row(/Kitchen/);
    expect(within(kitchen).getByText("$393.01")).toBeInTheDocument();
    expect(within(kitchen).getByText("$69.44")).toBeInTheDocument();
    const bedroom = row(/Primary Bedroom/);
    expect(within(bedroom).getByText("$880.06")).toBeInTheDocument();
    expect(within(bedroom).getByText("$440.03 each")).toBeInTheDocument();
    expect(within(bedroom).getByText("$89.66")).toBeInTheDocument();
    const gateway = row(/Accessory/);
    expect(within(gateway).getByText("$100.07")).toBeInTheDocument();
    expect(screen.queryByText("$111.11")).toBeNull();

    expect(total("Products")).toHaveTextContent("$1,373.14");
    expect(total("HD handling fee")).toHaveTextContent("$25.07");
    expect(total("Installation")).toHaveTextContent("$450.13");
    expect(total("Client total")).toHaveTextContent("$1,848.34");
    expect(total("Your cost (HD)")).toHaveTextContent("$1,212.79");
    expect(total("Margin")).toHaveTextContent("$185.42");
  });

  it("shows the MSRP, qty, cost and key details from the imported line", () => {
    render(<QuoteReview jobId={J} review={review()} />);
    const kitchen = row(/Kitchen/);
    expect(within(kitchen).getByText("$655")).toBeInTheDocument();
    expect(within(kitchen).getByText("$323.57")).toBeInTheDocument();
    expect(within(kitchen).getByText('36" W x 48" H · Inside · White')).toBeInTheDocument();
    expect(within(kitchen).getByText("Duette Honeycomb Shades")).toBeInTheDocument();
    expect(within(row(/Primary Bedroom/)).getByText("2")).toBeInTheDocument();
  });

  it("shows Oversized only when there is a charge", () => {
    const { unmount } = render(<QuoteReview jobId={J} review={review()} />);
    expect(screen.queryByText("Oversized", { selector: "dt" })).toBeNull();
    unmount();
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, priced: { ...r.priced, oversizedCents: 4003 } }} />);
    expect(total("Oversized")).toHaveTextContent("$40.03");
  });

  it("says which install price is used", () => {
    const { unmount } = render(<QuoteReview jobId={J} review={review()} />);
    expect(screen.getByText("Final install price, Sep 20, 2026")).toBeInTheDocument();
    unmount();
    render(<QuoteReview jobId={J} review={review({ install: { id: "e", kind: "estimate", totalCents: 1, createdAt: new Date("2026-09-19T18:00:00Z") } })} />);
    expect(screen.getByText("Estimate, Sep 19, 2026")).toBeInTheDocument();
  });

  it("heads the review with the DC quote, version count, status and a Dealer copy link", () => {
    render(<QuoteReview jobId={J} review={review({ olderVersions: [version({ id: "old", version: 1 })] })} />);
    expect(screen.getByRole("heading", { name: "DC quote 12345678 · version 2 of 2" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dealer copy" })).toHaveAttribute("href", "/admin/files/file-1");
  });
});

describe("QuoteReview % of MSRP", () => {
  it("fills each box with the % priced, placeholders the rule, and marks an override adjusted", () => {
    render(<QuoteReview jobId={J} review={review()} />);
    const one = screen.getByLabelText("Line 1 % of MSRP");
    expect(one).toHaveValue("60");
    expect(one).toHaveAttribute("placeholder", "60");
    const two = screen.getByLabelText("Line 2 % of MSRP");
    expect(two).toHaveValue("55");
    expect(two).toHaveAttribute("placeholder", "57.5");
    expect(within(row(/Primary Bedroom/)).getByText("adjusted")).toBeInTheDocument();
    expect(within(row(/Kitchen/)).queryByText("adjusted")).toBeNull();
  });

  it("saves a changed % on blur, and skips an unchanged one", async () => {
    render(<QuoteReview jobId={J} review={review()} />);
    const one = screen.getByLabelText("Line 1 % of MSRP");
    fireEvent.blur(one);
    expect(setLinePctAction).not.toHaveBeenCalled();
    fireEvent.change(one, { target: { value: "58" } });
    fireEvent.blur(one);
    await waitFor(() => expect(setLinePctAction).toHaveBeenCalledWith(J, V, 1, "58"));
  });

  it("shows the problem on the line", async () => {
    setLinePctAction.mockResolvedValueOnce({ error: "Enter a percentage like 60 or 57.5" });
    render(<QuoteReview jobId={J} review={review()} />);
    const one = screen.getByLabelText("Line 1 % of MSRP");
    fireEvent.change(one, { target: { value: "abc" } });
    fireEvent.blur(one);
    expect(await within(row(/Kitchen/)).findByRole("alert")).toHaveTextContent("Enter a percentage like 60 or 57.5");
  });

  it("links a line with no markup to Settings", () => {
    const r = review();
    const lines = [...r.priced.lines];
    lines[2] = { position: 3, pct: null, source: "missing", sellUnitCents: null, sellExtendedCents: null, marginCents: null };
    render(<QuoteReview jobId={J} review={{ ...r, rules: { Duette: 60, Silhouette: 57.5 }, priced: { ...r.priced, lines, productsCents: null, clientTotalCents: null, marginCents: null } }} />);
    expect(within(row(/Accessory/)).getByRole("link", { name: "Set a markup in Settings" })).toHaveAttribute("href", "/admin/settings#markup-heading");
    expect(screen.getByLabelText("Line 3 % of MSRP")).toHaveValue("");
    expect(total("Client total")).toHaveTextContent("—");
  });
});

describe("QuoteReview choices", () => {
  it("waives the handling fee", async () => {
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Waive" }));
    await waitFor(() => expect(setChoicesAction).toHaveBeenCalledWith(J, V, { waiveHandling: true }));
  });

  it("marks no installation", async () => {
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "No installation on this job" }));
    await waitFor(() => expect(setChoicesAction).toHaveBeenCalledWith(J, V, { noInstall: true }));
  });

  it("shows a refusal", async () => {
    setChoicesAction.mockResolvedValueOnce({ error: "This version can no longer be changed." });
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Waive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This version can no longer be changed.");
  });
});

describe("QuoteReview send", () => {
  it("lists each blocker and disables Send", () => {
    render(<QuoteReview jobId={J} review={review({ blockers: ["Set a markup for PowerView first.", "Add the client's email address to the job first."] })} />);
    const list = screen.getByRole("list", { name: "Before you can send" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Set a markup for PowerView first.", "Add the client's email address to the job first.",
    ]);
    expect(screen.getByRole("button", { name: "Send contract" })).toBeDisabled();
  });

  it("sends the reviewed version with review.fingerprint unchanged", async () => {
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("button", { name: "Send contract" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/^Contract sent\.$/);
    expect(sendContractAction).toHaveBeenCalledWith(J, V, FP);
  });

  it("tells the owner plainly when the client email failed", async () => {
    sendContractAction.mockResolvedValueOnce({ ok: true, emailed: false });
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("button", { name: "Send contract" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Contract sent, but the email to the client failed — send them their project page link yourself.",
    );
  });

  it("shows Send's error", async () => {
    sendContractAction.mockResolvedValueOnce({ error: "Prices changed since you opened this page. Review them and send again." });
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("button", { name: "Send contract" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Prices changed since you opened this page. Review them and send again.");
  });
});

describe("QuoteReview after sending", () => {
  const sent = version({ status: "sent", sentAt: new Date("2026-09-21T18:00:00Z"), clientTotalCents: 184834 });

  it("locks every input and says when and for how much it was sent", () => {
    render(<QuoteReview jobId={J} review={review({ version: sent, blockers: ["This version has already been sent."] })} />);
    for (const box of screen.getAllByRole("textbox")) expect(box).toHaveAttribute("readonly");
    expect(screen.getByRole("checkbox", { name: "Waive" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "No installation on this job" })).toBeDisabled();
    expect(screen.getByText("Sent Sep 21, 2026 for $1,848.34")).toBeInTheDocument();
    expect(screen.queryByText(/ready to order/)).toBeNull();
  });

  it("says when today's markup would price a sent version differently", () => {
    render(<QuoteReview jobId={J} review={review({ version: { ...sent, clientTotalCents: 180000 }, blockers: ["This version has already been sent."] })} />);
    expect(screen.getByText("The contract sent was $1,800. The figures below are recalculated with today's markup.")).toBeInTheDocument();
  });

  it("points a signed version at Direct Connect to order", () => {
    const signed = { ...sent, status: "signed" as const, signedAt: new Date("2026-09-22T18:00:00Z") };
    render(<QuoteReview jobId={J} review={review({ version: signed, blockers: ["This version has already been sent."] })} />);
    expect(screen.getByText("Signed Sep 22, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Signed — ready to order: Open quote 12345678 in Direct Connect" })).toHaveAttribute("href", dcQuoteUrl("12345678"));
  });
});

describe("QuoteReview versions", () => {
  const v1 = version({
    id: "v1", version: 1, status: "signed", clientTotalCents: 150000, signedAt: new Date("2026-09-10T18:00:00Z"),
    lines: [line(1, { msrpUnitCents: 60000 }), line(2, { qty: 1, room: "Primary Bedroom", description: "Hunter Douglas Silhouette", msrpUnitCents: 80000 }), line(4, { description: "Hunter Douglas Pirouette" })],
  });

  it("lists older versions with their status and total", () => {
    const draft = version({ id: "v0", version: 0 });
    render(<QuoteReview jobId={J} review={review({ olderVersions: [v1, draft] })} />);
    const older = screen.getByText("Older versions").closest("details")!;
    expect(within(older).getByText("Version 1 · signed · $1,500")).toBeInTheDocument();
    expect(within(older).getByText("Version 0 · draft · not sent")).toBeInTheDocument();
  });

  it("says what changed from the previous version", () => {
    render(<QuoteReview jobId={J} review={review({ olderVersions: [v1] })} />);
    const changes = screen.getByRole("list", { name: "Changes from version 1:" });
    expect(within(changes).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Line 1 Hunter Douglas Duette Honeycomb Shades: MSRP $600 → $655",
      "Line 2 Hunter Douglas Silhouette: qty 1 → 2",
      "Line 3 added: Hunter Douglas PowerView Gateway",
      "Line 4 removed: Hunter Douglas Pirouette",
    ]);
  });

  it("warns that the client already signed an earlier version", () => {
    render(<QuoteReview jobId={J} review={review({ olderVersions: [v1] })} />);
    expect(screen.getByText("The client signed version 1 for $1,500. Sending this one asks them to sign a change for $1,848.34.")).toBeInTheDocument();
  });

  it("gives no signed warning when nothing was signed", () => {
    render(<QuoteReview jobId={J} review={review({ olderVersions: [{ ...v1, status: "superseded" }] })} />);
    expect(screen.queryByText(/The client signed/)).toBeNull();
  });
});

describe("DcButtons", () => {
  it("opens the existing quote", () => {
    render(<DcButtons projectNo="PSS-1042" dcQuoteNo="12345678" />);
    const link = screen.getByRole("link", { name: "Open quote 12345678 in Direct Connect" });
    expect(link).toHaveAttribute("href", dcQuoteUrl("12345678"));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("creates a quote and copies the PSS number for PO Reference", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<DcButtons projectNo="PSS-1042" dcQuoteNo={null} />);
    const link = screen.getByRole("link", { name: "Create quote in Direct Connect" });
    expect(link).toHaveAttribute("href", DC_NEW_QUOTE_URL);
    fireEvent.click(link);
    expect(writeText).toHaveBeenCalledWith("PSS-1042");
    expect(await screen.findByRole("status")).toHaveTextContent("PSS-1042 copied. Paste it into PO Reference.");
  });

  it("says to type the number when copying fails", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    render(<DcButtons projectNo="PSS-1042" dcQuoteNo={null} />);
    fireEvent.click(screen.getByRole("link", { name: "Create quote in Direct Connect" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Type PSS-1042 into PO Reference.");
  });
});

describe("CheckNowButton", () => {
  it("checks the mailbox and shows the answer", async () => {
    checkNowAction.mockResolvedValueOnce({ message: "Imported 1." });
    render(<CheckNowButton jobId={J} />);
    fireEvent.click(screen.getByRole("button", { name: "Check for new quotes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Imported 1.");
    expect(checkNowAction).toHaveBeenCalledWith(J);
  });
});

describe("QuoteTab", () => {
  const job = { id: J, projectNo: 1042 } as Parameters<typeof QuoteTab>[0]["job"];

  it("explains how to start when no quote has arrived", async () => {
    loadReview.mockResolvedValueOnce(null);
    render(await QuoteTab({ job }));
    expect(loadReview).toHaveBeenCalledWith(J);
    expect(screen.getByText("No Direct Connect quote yet. Put PSS-1042 in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create quote in Direct Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for new quotes" })).toBeInTheDocument();
  });

  it("shows the review and links the quote once one has arrived", async () => {
    loadReview.mockResolvedValueOnce(review());
    render(await QuoteTab({ job }));
    expect(screen.getByRole("link", { name: "Open quote 12345678 in Direct Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send contract" })).toBeInTheDocument();
  });
});
