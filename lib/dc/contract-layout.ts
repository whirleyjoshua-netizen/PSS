import { formatCents } from "@/lib/admin/money";

/**
 * What the client contract shows. Deliberately client prices only: no cost, MSRP, cost
 * factor, markup percentage or DC quote number has a field here, so none can be drawn.
 */
export type ContractInput = {
  projectNo: string; version: number; date: Date;
  client: { name: string; address: string | null; city: string; email: string | null };
  lines: { room: string; description: string; options: [string, string][]; qty: number; sellUnitCents: number; sellExtendedCents: number }[];
  installCents: number; handlingChargedCents: number; oversizedCents: number; clientTotalCents: number;
  /** The owner's discount (migration 042), printed as its own line only when there is one; clientTotalCents is after it. */
  discount?: { label: string; pct: number | null; cents: number } | null;
};
export type ContractRow = { room: string; product: string; details: string; qty: string; unit: string; total: string };

/** Marks mapped to plain ASCII so the contract reads the same whatever the source typed. */
const TYPOGRAPHIC: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2033": '"', "\u2032": "'",
  "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " ", "\u202f": " ",
};

/**
 * Characters outside Latin-1 that WinAnsi (the standard fonts' encoding) places in 0x80-0x9F:
 * € ‚ ƒ „ † ‡ ˆ ‰ Š ‹ Œ Ž • ˜ ™ š › œ ž Ÿ (quotes, dashes and ellipsis are mapped above).
 * The test checks this list against pdf-lib's own Helvetica encoder.
 */
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2022, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const encodable = (ch: string) => /[\x20-\x7e\xa1-\xff]/.test(ch) || WIN_ANSI_EXTRA.has(ch.codePointAt(0)!);

/**
 * Text pdf-lib's standard (WinAnsi) fonts can draw: any run of whitespace (newlines, tabs)
 * becomes one space, typographic marks are mapped, WinAnsi characters are kept, the rest "?".
 */
export function winAnsiSafe(text: string): string {
  return [...text.replace(/\s+/g, " ")].map((ch) => TYPOGRAPHIC[ch] ?? (encodable(ch) ? ch : "?")).join("");
}

/** The details a client recognises: size, mount, fabric and color, control. Everything else stays in DC. */
export function keyDetails(options: [string, string][]): string {
  const get = (label: string) => options.find(([l]) => l === label)?.[1] ?? "";
  const width = get("Order Width");
  const height = get("Order Height");
  const size = width && height ? `${width}" W x ${height}" H` : "";
  const fabric = [get("Fabric Type"), get("Color")].filter(Boolean).join(", ");
  return [size, get("Mount Type"), fabric, get("Control System")].filter(Boolean).join(" · ");
}

export function contractRows(input: ContractInput): { rows: ContractRow[]; totals: [string, string][] } {
  const rows: ContractRow[] = input.lines.map((line) => ({
    room: line.room || "Accessory",
    product: line.description.replace(/^Hunter Douglas\s+/, ""),
    details: keyDetails(line.options),
    qty: String(line.qty),
    unit: formatCents(line.sellUnitCents),
    total: formatCents(line.sellExtendedCents),
  }));
  const totals: [string, string][] = [];
  if (input.installCents > 0) totals.push(["Installation", formatCents(input.installCents)]);
  if (input.handlingChargedCents > 0) totals.push(["Hunter Douglas handling", formatCents(input.handlingChargedCents)]);
  if (input.oversizedCents > 0) totals.push(["Oversize charge", formatCents(input.oversizedCents)]);
  const discount = input.discount && input.discount.cents > 0 ? input.discount : null;
  if (discount) {
    totals.push(["Subtotal", formatCents(input.clientTotalCents + discount.cents)]);
    // A plain hyphen: the PDF fonts have no minus sign.
    totals.push([discount.pct !== null ? `${discount.label} (${discount.pct}% off)` : discount.label, `-${formatCents(discount.cents)}`]);
  }
  totals.push(["Total", formatCents(input.clientTotalCents)]);
  return { rows, totals };
}
