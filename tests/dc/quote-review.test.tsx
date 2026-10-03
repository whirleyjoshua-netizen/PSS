import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Review } from "@/lib/dc/send";
import type { StoredLine, StoredVersion } from "@/lib/dc/store";
import { DC_NEW_QUOTE_URL, dcQuoteUrl } from "@/lib/dc/links";

const setLinePctAction = vi.fn();
const setChoicesAction = vi.fn();
const sendQuoteAction = vi.fn();
const sendContractAction = vi.fn();
const checkNowAction = vi.fn();
const addQuoteOptionAction = vi.fn();
vi.mock("@/app/admin/jobs/[id]/quote-actions", () => ({ setLinePctAction, setChoicesAction, sendQuoteAction, sendContractAction, checkNowAction, addQuoteOptionAction }));
const loadReview = vi.fn();
vi.mock("@/lib/dc/send", () => ({ loadReview }));
const depositState = vi.fn(async (_id: string) => null as unknown);
vi.mock("@/lib/payments/deposits", () => ({ depositState }));
const listQuoteOptions = vi.fn(async (_id: string) => ["A"]);
vi.mock("@/lib/dc/store", () => ({ listQuoteOptions }));
vi.mock("@/app/admin/jobs/[id]/deposit-actions", () => ({ recordDepositAction: vi.fn(), cancelDepositAction: vi.fn() }));

const { QuoteReview } = await import("@/app/admin/jobs/[id]/QuoteReview");
const { AddQuoteOptionButton, DcButtons, CheckNowButton } = await import("@/app/admin/jobs/[id]/DcButtons");
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
  id: V, leadId: J, version: 2, option: "A", dcQuoteNo: "12345678", poReference: "PSS-1042", clientName: "Jane Client", sourceFileId: "file-1", sourceSha256: "x",
  status: "draft", subtotalCents: 0, handlingFeeCents: 2500, oversizedFeeCents: 0, dealerTotalCents: 121277,
  waiveHandling: false, noInstall: false, installQuoteId: null, installCents: null, productsCents: null, clientTotalCents: null,
  contractFileId: null, sentAt: null, signedAt: null, createdAt: new Date("2026-09-20T18:00:00Z"),
  quoteFileId: null, offeredAt: null, approvedAt: null, handlingFoldedCents: null, installFoldedCents: null, lines: LINES, ...over,
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
    productsCents: 137314, handlingChargedCents: 2507, handlingFoldedCents: 0, oversizedCents: 0, installCents: 45013, installFoldedCents: 0, installLineCents: 45013, installQuoteId: "iq-1",
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
  sendQuoteAction.mockResolvedValue({ ok: true, emailed: true });
  sendContractAction.mockResolvedValue({ ok: true, emailed: true });
  checkNowAction.mockResolvedValue({ message: "No new Dealer Copies." });
  addQuoteOptionAction.mockResolvedValue({ letter: "B" });
  listQuoteOptions.mockResolvedValue(["A"]);
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
    // A version sent before the fee was built into prices: its own line, in the sum.
    expect(total("HD handling fee")).toHaveTextContent("$25.07");
    expect(total("Installation")).toHaveTextContent("$450.13");
    expect(total("Client total")).toHaveTextContent("$1,848.34");
    expect(total("Your cost (HD)")).toHaveTextContent("$1,212.79");
    expect(total("Margin")).toHaveTextContent("$185.42");
  });

  it("says the handling fee is in the line prices, outside the sum, when it was built in", () => {
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, version: version({ handlingFeeCents: 2507 }), priced: { ...r.priced, handlingChargedCents: 0, handlingFoldedCents: 2507 } }} />);
    expect(total("HD handling fee")).toHaveTextContent(/^\$25\.07 in line prices$/);
    expect(screen.getByText("HD handling fee").parentElement).toHaveClass("text-ink-soft");
    expect(screen.getByRole("checkbox", { name: "Waive" })).not.toBeChecked();
  });

  it("says installation is in the line prices, outside the sum, when it was built in", () => {
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, priced: { ...r.priced, installFoldedCents: 45013, installLineCents: 0 } }} />);
    expect(total("Installation")).toHaveTextContent("$450.13 in line prices");
    expect(screen.getByText("Installation", { selector: "dt" }).parentElement).toHaveClass("text-ink-soft");
    expect(screen.getByRole("checkbox", { name: "No installation on this job" })).toBeInTheDocument();
  });

  it("says how much of the install price is in the lines when it couldn't all split to the cent", () => {
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, priced: { ...r.priced, installCents: 50000, installFoldedCents: 49998, installLineCents: 0 } }} />);
    expect(total("Installation")).toHaveTextContent("$499.98 of $500 in line prices");
  });

  it("says how much of the handling fee is in the lines when it couldn't all split to the cent", () => {
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, version: version({ handlingFeeCents: 2508 }), priced: { ...r.priced, handlingChargedCents: 0, handlingFoldedCents: 2507 } }} />);
    expect(total("HD handling fee")).toHaveTextContent("$25.07 of $25.08 in line prices");
  });

  it("says None for installation when there is none", () => {
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, priced: { ...r.priced, installCents: 0, installFoldedCents: 0, installLineCents: 0 } }} />);
    expect(total("Installation")).toHaveTextContent("None");
  });

  it("says None when there is no fee to build in", () => {
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, priced: { ...r.priced, handlingChargedCents: 0, handlingFoldedCents: 0 } }} />);
    expect(total("HD handling fee")).toHaveTextContent("None");
  });

  it("says Waived when the fee is waived", () => {
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, priced: { ...r.priced, handlingChargedCents: 0, handlingFoldedCents: 0, waiveHandling: true } }} />);
    expect(total("HD handling fee")).toHaveTextContent("Waived");
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

  it("names the Direct Connect client beside the quote number, so a wrong household stands out", () => {
    render(<QuoteReview jobId={J} review={review()} />);
    const header = screen.getByRole("heading", { name: /^DC quote 12345678/ }).closest("header")!;
    expect(within(header).getByText("Direct Connect client: Jane Client")).toBeInTheDocument();
  });

  it("says so when DC printed no client name", () => {
    render(<QuoteReview jobId={J} review={review({ version: version({ clientName: "" }) })} />);
    expect(screen.getByText("Direct Connect client: none given")).toBeInTheDocument();
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

  it("shows a refusal and puts the box back to what is saved", async () => {
    setChoicesAction.mockResolvedValueOnce({ error: "This version can no longer be changed." });
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Waive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This version can no longer be changed.");
    expect(screen.getByRole("checkbox", { name: "Waive" })).not.toBeChecked();
  });

  it("disables both boxes while a choice is saving, so two toggles can't land out of order", async () => {
    let finish!: (value: object) => void;
    setChoicesAction.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Waive" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Waive" })).toBeDisabled());
    expect(screen.getByRole("checkbox", { name: "No installation on this job" })).toBeDisabled();
    finish({});
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Waive" })).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: "No installation on this job" })).toBeEnabled();
  });
});

describe("QuoteReview send", () => {
  it("lists each blocker and disables Send", () => {
    render(<QuoteReview jobId={J} review={review({ blockers: ["Set a markup for PowerView first.", "Add the client's email address to the job first."] })} />);
    const list = screen.getByRole("list", { name: "Before you can send" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Set a markup for PowerView first.", "Add the client's email address to the job first.",
    ]);
    expect(screen.getByRole("button", { name: "Send quote" })).toBeDisabled();
  });

  it("previews the quote in a new tab, even while Send is blocked by something other than the price", () => {
    render(<QuoteReview jobId={J} review={review({ blockers: ["Add the client's email address to the job first."] })} />);
    const link = screen.getByRole("link", { name: "Preview quote" });
    expect(link).toHaveAttribute("href", `/admin/jobs/${J}/quote-preview`);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("offers no preview while the price is incomplete", () => {
    const r = review();
    render(<QuoteReview jobId={J} review={{ ...r, priced: { ...r.priced, blockers: ["Set a markup for PowerView first."] }, blockers: ["Set a markup for PowerView first."] }} />);
    expect(screen.queryByRole("link", { name: "Preview quote" })).toBeNull();
    expect(screen.getByRole("button", { name: "Preview quote" })).toBeDisabled();
  });

  it("offers no preview once the quote has been sent", () => {
    render(<QuoteReview jobId={J} review={review({ version: version({ status: "offered", offeredAt: new Date("2026-09-21T18:00:00Z") }) })} />);
    expect(screen.queryByRole("link", { name: "Preview quote" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview quote" })).toBeNull();
  });

  it("sends the reviewed version with review.fingerprint unchanged", async () => {
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("button", { name: "Send quote" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/^Quote sent\.$/);
    expect(sendQuoteAction).toHaveBeenCalledWith(J, V, FP);
  });

  it("tells the owner plainly when the client email failed", async () => {
    sendQuoteAction.mockResolvedValueOnce({ ok: true, emailed: false });
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("button", { name: "Send quote" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Quote sent, but the email to the client failed — send them their project page link yourself.",
    );
  });

  it("shows Send's error", async () => {
    sendQuoteAction.mockResolvedValueOnce({ error: "Prices changed since you opened this page. Review them and send again." });
    render(<QuoteReview jobId={J} review={review()} />);
    fireEvent.click(screen.getByRole("button", { name: "Send quote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Prices changed since you opened this page. Review them and send again.");
  });
});

describe("QuoteReview after sending", () => {
  const sent = version({ status: "sent", sentAt: new Date("2026-09-21T18:00:00Z"), clientTotalCents: 184834,
    offeredAt: new Date("2026-09-20T18:00:00Z"), approvedAt: new Date("2026-09-20T20:00:00Z") });

  it("locks every input and says when and for how much it was sent", () => {
    render(<QuoteReview jobId={J} review={review({ version: sent, blockers: ["This version has already been sent."] })} />);
    for (const box of screen.getAllByRole("textbox")) expect(box).toHaveAttribute("readonly");
    expect(screen.getByRole("checkbox", { name: "Waive" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "No installation on this job" })).toBeDisabled();
    expect(screen.getByText("Contract sent Sep 21, 2026 for $1,848.34")).toBeInTheDocument();
    expect(screen.queryByText(/ready to order/)).toBeNull();
  });

  it("reads the sent total from review.priced, the frozen figures", () => {
    const r = review({ version: { ...sent, clientTotalCents: 180000 }, blockers: ["This version has already been sent."] });
    render(<QuoteReview jobId={J} review={{ ...r, priced: { ...r.priced, clientTotalCents: 177717 } }} />);
    expect(screen.getByText("Contract sent Sep 21, 2026 for $1,777.17")).toBeInTheDocument();
    expect(total("Client total")).toHaveTextContent("$1,777.17");
  });

  it("points a signed version at Direct Connect to order", () => {
    const signed = { ...sent, status: "signed" as const, signedAt: new Date("2026-09-22T18:00:00Z") };
    render(<QuoteReview jobId={J} review={review({ version: signed, blockers: ["This version has already been sent."] })} now={new Date("2026-10-01T12:00:00Z")} />);
    expect(screen.getByText("Signed Sep 22, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Signed — ready to order: Open quote 12345678 in Direct Connect" })).toHaveAttribute("href", dcQuoteUrl("12345678"));
  });

  describe("the cancellation window", () => {
    const signedMonday = () => ({ ...sent, status: "signed" as const, signedAt: new Date("2026-09-28T17:00:00Z") });
    it("during the window, says when it ends and offers no order link", () => {
      render(<QuoteReview jobId={J} review={review({ version: signedMonday() })} now={new Date("2026-09-29T17:00:00Z")} />);
      expect(screen.getByText(/^Signed Sep 28, 2026\. Cancellation window ends at the end of Oct 1, 2026 — place the Direct Connect order after that\.$/)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /ready to order/ })).toBeNull();
    });
    it("is still in the window a millisecond before midnight after the third business day", () => {
      render(<QuoteReview jobId={J} review={review({ version: signedMonday() })} now={new Date("2026-10-02T06:59:59.999Z")} />);
      expect(screen.getByText(/^Signed Sep 28, 2026\. Cancellation window ends at the end of Oct 1, 2026 — place the Direct Connect order after that\.$/)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /ready to order/ })).toBeNull();
    });
    it("from midnight after the third business day, is ready to order", () => {
      render(<QuoteReview jobId={J} review={review({ version: signedMonday() })} now={new Date("2026-10-02T07:00:00Z")} />);
      expect(screen.getByRole("link", { name: /^Signed — ready to order/ })).toBeInTheDocument();
      expect(screen.queryByText(/Cancellation window/)).toBeNull();
    });
  });
});

describe("QuoteReview after Send quote", () => {
  const offered = version({ status: "offered", offeredAt: new Date("2026-09-21T18:00:00Z"), clientTotalCents: 184834 });

  it("says the quote went out and is waiting for the client, with no contract button", () => {
    render(<QuoteReview jobId={J} review={review({ version: offered, blockers: ["This version has already been sent."] })} />);
    expect(screen.getByText("Quote sent")).toBeInTheDocument();
    expect(screen.getByText("Quote sent Sep 21, 2026 for $1,848.34. Waiting for the client to approve it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send contract" })).toBeNull();
  });

  it("offers Send contract when the client approved but the contract did not go out, and sends it", async () => {
    sendContractAction.mockResolvedValueOnce({ ok: true, emailed: true });
    const approved = { ...offered, approvedAt: new Date("2026-09-22T18:00:00Z") };
    render(<QuoteReview jobId={J} review={review({ version: approved, blockers: ["This version has already been sent."] })} />);
    expect(screen.getByText("The client approved this quote on Sep 22, 2026, but the contract was not sent.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send contract" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/^Contract sent\.$/);
    expect(sendContractAction).toHaveBeenCalledWith(J, V);
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
    expect(loadReview).toHaveBeenCalledWith(J, "A");
    expect(screen.getByText("No Direct Connect quote yet. Put PSS-1042 in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create quote in Direct Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for new quotes" })).toBeInTheDocument();
  });

  it("shows the review and links the quote once one has arrived", async () => {
    loadReview.mockResolvedValueOnce(review());
    render(await QuoteTab({ job }));
    expect(screen.getByRole("link", { name: "Open quote 12345678 in Direct Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send quote" })).toBeInTheDocument();
  });

  // Ruling P9: QuoteTab reads no job status; whether the panel shows is decided by depositState alone.
  it("shows the deposit panel once a contract is signed, and none before", async () => {
    loadReview.mockResolvedValueOnce(review()).mockResolvedValueOnce(review());
    render(await QuoteTab({ job }));
    expect(depositState).toHaveBeenCalledWith(J);
    expect(screen.queryByRole("region", { name: "Deposit" })).toBeNull();
    depositState.mockResolvedValueOnce({ jobStatus: "signed", versionId: V, version: 2, versionStatus: "signed", soldCents: 184834,
      amountCents: 92417, signedAt: new Date("2026-09-28T17:00:00Z"), paid: null, pending: null, refunded: null });
    render(await QuoteTab({ job }));
    expect(screen.getByRole("region", { name: "Deposit" })).toHaveTextContent("50% deposit due: $924.17 of $1,848.34.");
  });

  // A legacy job moved past Signed by hand, with no deposit ever taken: the panel would be an empty heading.
  it("shows no deposit panel when there is no deposit and the job is not Signed, and keeps it for a paid or refunded one", async () => {
    const base = { versionId: V, version: 2, versionStatus: "signed", soldCents: 184834, amountCents: 92417,
      signedAt: new Date("2026-09-28T17:00:00Z"), paid: null, pending: null, refunded: null };
    loadReview.mockResolvedValue(review());
    depositState.mockResolvedValueOnce({ ...base, jobStatus: "ordered" });
    const { unmount } = render(await QuoteTab({ job }));
    expect(screen.queryByRole("region", { name: "Deposit" })).toBeNull();
    unmount();
    depositState.mockResolvedValueOnce({ ...base, jobStatus: "ordered", paid: { id: "d1", amountCents: 92417, method: "check", paidAt: new Date("2026-09-29T17:00:00Z") } });
    const second = render(await QuoteTab({ job }));
    expect(screen.getByRole("region", { name: "Deposit" })).toHaveTextContent("Deposit $924.17 paid by check");
    second.unmount();
    depositState.mockResolvedValueOnce({ ...base, jobStatus: "lost", versionStatus: "cancelled", refunded: { id: "d1", amountCents: 92417, refundedAt: new Date("2026-09-30T17:00:00Z") } });
    render(await QuoteTab({ job }));
    expect(screen.getByRole("region", { name: "Deposit" })).toHaveTextContent("Deposit $924.17 refunded");
  });

  it("shows one card per option, A first, each headed with its number, once the job has two", async () => {
    listQuoteOptions.mockResolvedValueOnce(["A", "B"]);
    loadReview.mockResolvedValueOnce(review()).mockResolvedValueOnce(null);
    render(await QuoteTab({ job }));
    expect(loadReview).toHaveBeenNthCalledWith(1, J, "A");
    expect(loadReview).toHaveBeenNthCalledWith(2, J, "B");
    const a = screen.getByRole("region", { name: "Option A · PSS-1042" });
    const b = screen.getByRole("region", { name: "Option B · PSS-1042-B" });
    expect(within(a).getByRole("button", { name: "Send quote" })).toBeInTheDocument();
    expect(within(a).getByRole("link", { name: "Open quote 12345678 in Direct Connect" })).toBeInTheDocument();
    expect(within(b).getByText("No Direct Connect quote yet. Put PSS-1042-B in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.")).toBeInTheDocument();
    expect(within(b).getByRole("link", { name: "Create quote in Direct Connect" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Check for new quotes" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Add another quote" })).toHaveLength(1);
  });

  it("heads nothing with an option while the job has one", async () => {
    loadReview.mockResolvedValueOnce(review());
    render(await QuoteTab({ job }));
    expect(screen.queryByRole("region", { name: /^Option / })).toBeNull();
    expect(screen.getByRole("button", { name: "Add another quote" })).toBeInTheDocument();
  });
});

describe("AddQuoteOptionButton", () => {
  it("adds an option, and shows a refusal", async () => {
    addQuoteOptionAction.mockResolvedValueOnce({ error: "This job is marked Lost." });
    render(<AddQuoteOptionButton jobId={J} />);
    fireEvent.click(screen.getByRole("button", { name: "Add another quote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This job is marked Lost.");
    expect(addQuoteOptionAction).toHaveBeenCalledWith(J);
  });
});

describe("QuoteReview per option", () => {
  it("previews option B's quote by its option, and option A's at the plain address", () => {
    const { unmount } = render(<QuoteReview jobId={J} review={review({ version: version({ option: "B" }) })} />);
    expect(screen.getByRole("link", { name: "Preview quote" })).toHaveAttribute("href", `/admin/jobs/${J}/quote-preview?option=B`);
    unmount();
    render(<QuoteReview jobId={J} review={review()} />);
    expect(screen.getByRole("link", { name: "Preview quote" })).toHaveAttribute("href", `/admin/jobs/${J}/quote-preview`);
  });

  it("two reviews on one page keep their own headings and blocker lists", () => {
    const blocked = { blockers: ["Add the client's email address to the job first."] };
    render(<>
      <QuoteReview jobId={J} review={review(blocked)} />
      <QuoteReview jobId={J} review={review({ ...blocked, version: version({ id: "other-version", option: "B" }) })} />
    </>);
    expect(screen.getAllByRole("region", { name: /^DC quote 12345678/ })).toHaveLength(2);
    expect(screen.getAllByRole("list", { name: "Before you can send" })).toHaveLength(2);
  });

  // The test above passes with shared ids too (both headings read alike). Here each heading differs, and no id repeats.
  it("names each review by its own heading and repeats no id on the page", () => {
    const blocked = { blockers: ["Add the client's email address to the job first."] };
    const { container } = render(<>
      <QuoteReview jobId={J} review={review(blocked)} />
      <QuoteReview jobId={J} review={review({ ...blocked, version: version({ id: "other-version", option: "B", dcQuoteNo: "87654321" }) })} />
    </>);
    expect(screen.getByRole("region", { name: /^DC quote 12345678/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^DC quote 87654321/ })).toBeInTheDocument();
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
