/** One product line exactly as the Dealer Copy printed it, in cents. */
export type DcLine = {
  position: number;
  qty: number;
  /** "Location:" option; empty for accessories such as a Gateway. */
  room: string;
  description: string;
  /** "Collection:" option, trimmed. The markup key. */
  collection: string;
  baseCents: number;
  promotionCents: number;
  optionsCents: number;
  /** base + promotion + options, per unit. */
  msrpUnitCents: number;
  /** As printed ("0.4940"), or null when the column is blank. */
  costFactor: string | null;
  costUnitCents: number;
  costExtendedCents: number;
  /** Every option row, in printed order, "***" notes excluded. */
  options: [string, string][];
};

export type DcQuote = {
  quoteNo: string;
  poReference: string;
  /** The number inside "PSS-1042". */
  projectNo: number;
  clientName: string;
  lines: DcLine[];
  subtotalCents: number;
  handlingFeeCents: number;
  oversizedFeeCents: number;
  dealerTotalCents: number;
};

export type ParseRefusal = {
  outcome: "no-costs" | "incomplete" | "unreadable" | "no-po";
  detail: string;
  /** Set whenever the parser read a well-formed quote number before refusing. */
  quoteNo?: string;
  /** Set whenever the parser read the PO Reference cell before refusing, as printed. */
  poReference?: string;
};

export type ParseResult = { ok: true; quote: DcQuote } | { ok: false; refusal: ParseRefusal };

export type ImportOutcome =
  | "imported" | "unchanged" | "no-po" | "no-match" | "no-costs" | "incomplete" | "unreadable" | "failed";
