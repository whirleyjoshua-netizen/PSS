/**
 * Shutter quick-quote math. Pure: rates and windows in, cents out, so every rule
 * can be tested without a database.
 *
 * The rates themselves are the owners' dealer costs. They live only in the database
 * (entered on the Rates screen) because this repository is public: never put real
 * numbers in this file, in tests or in fixtures.
 */
import { z } from "zod";
import { quantityFor, type Basis } from "./install-pricing";

export const SUPPLIERS = ["norman", "onyx"] as const;
export type Supplier = (typeof SUPPLIERS)[number];
export const supplierLabel = (supplier: Supplier) => (supplier === "norman" ? "Norman" : "Onyx");

/**
 * How an add-on is charged. `percent` is basis points of the window's base price
 * (1000 = 10%); every other kind is cents per unit.
 */
export const OPTION_KINDS = ["percent", "per_window", "per_panel", "per_sqft", "per_linear_ft", "each", "per_order"] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

export const OPTION_KIND_LABEL: Record<OptionKind, string> = {
  percent: "% of base",
  per_window: "Per window",
  per_panel: "Per panel",
  per_sqft: "Per sq ft",
  per_linear_ft: "Per foot",
  each: "Each",
  per_order: "Per order",
};

/** Kinds where the person quoting types a count (or feet) for each window. */
export const COUNTED_KINDS: readonly OptionKind[] = ["each", "per_linear_ft"];

/**
 * `clientCentsPerSqft` is the line's own client price, installed and shipped. When set it
 * replaces the markup for this line. Null uses the markup.
 */
export type ShutterLine = {
  id: string; supplier: Supplier; name: string; costCentsPerSqft: number; minSqft: number; clientCentsPerSqft: number | null;
  /** What the frame adds to the window's width and to its height, in eighths: the supplier bills the framed size. */
  frameAddEighths: number;
};
export type ShutterOption = { id: string; supplier: Supplier; name: string; kind: OptionKind; amount: number };

/**
 * Freight as one formula that fits both suppliers: a per-shutter charge (first and each
 * additional), an oversize charge for wide shutters, and a per-sq-ft charge with a
 * minimum billable area per shipment. Unused parts are 0.
 */
export type SupplierFreight = {
  supplier: Supplier;
  firstCents: number;
  additionalCents: number;
  oversizeWidthEighths: number;
  oversizeFirstCents: number;
  oversizeAdditionalCents: number;
  perSqftCents: number;
  minSqft: number;
};

export const NO_FREIGHT = (supplier: Supplier): SupplierFreight => ({
  supplier, firstCents: 0, additionalCents: 0, oversizeWidthEighths: 0,
  oversizeFirstCents: 0, oversizeAdditionalCents: 0, perSqftCents: 0, minSqft: 0,
});

export type ShutterRates = {
  lines: ShutterLine[];
  options: ShutterOption[];
  freight: SupplierFreight[];
  /** Client price multiple of cost in hundredths (191 = 1.91×). Null until the owner sets it. */
  markupHundredths: number | null;
  /**
   * What PSS charges to install, per sq ft, in this guide only. Separate from Settings →
   * Installation rates, which prices install-only jobs. Null until set.
   */
  installCentsPerSqft: number | null;
};

/** How the guide charges to install. Null when not set. */
export type ShutterInstallRate = { basis: Basis; rateCents: number } | null;

export type QuoteWindow = {
  room: string;
  lineId: string;
  widthEighths: number;
  heightEighths: number;
  quantity: number;
  panels: number;
  /** Option id → how many. 1 for a ticked box; the typed count or feet for counted kinds. */
  options: Record<string, number>;
};

export type QuoteInput = {
  supplier: Supplier;
  windows: QuoteWindow[];
  /** Per-order option id → how many (e.g. custom colors on the order). */
  orderOptions: Record<string, number>;
};

const SQ_EIGHTHS_PER_SQFT = 9216; // 144 sq in, in eighths squared

export type PricedWindow = QuoteWindow & {
  lineName: string;
  /** Area of one shutter in sq ft, frame included, before the line's minimum. */
  sqft: number;
  /** Area billed for one shutter: at least the line's minimum. */
  billedSqft: number;
  /** Product cost for all `quantity` shutters: base + add-ons. */
  costCents: number;
  installCents: number;
  /** This window's share of freight, by product cost. */
  freightCents: number;
  /** What the client pays for this window, install and delivery included. Null without a markup. */
  priceCents: number | null;
};

export type PricedQuote = {
  windows: PricedWindow[];
  orderCostCents: number;
  productCostCents: number;
  freightCents: number;
  installCents: number;
  /** Product + freight: what the supplier bills. */
  supplierCostCents: number;
  priceCents: number | null;
  /** Price minus supplier cost and install charge: what is left before install labor. Null without a markup. */
  marginCents: number | null;
  shutterCount: number;
};

const sqftOf = (widthEighths: number, heightEighths: number) => (widthEighths * heightEighths) / SQ_EIGHTHS_PER_SQFT;

export function freightFor(freight: SupplierFreight, windows: { widthEighths: number; quantity: number; sqft: number }[]): number {
  const count = windows.reduce((sum, w) => sum + w.quantity, 0);
  if (count === 0) return 0;
  const oversize = freight.oversizeWidthEighths > 0
    ? windows.reduce((sum, w) => sum + (w.widthEighths >= freight.oversizeWidthEighths ? w.quantity : 0), 0)
    : 0;
  const area = windows.reduce((sum, w) => sum + w.sqft * w.quantity, 0);
  const perShutter = freight.firstCents + freight.additionalCents * (count - 1);
  const oversizeCents = oversize > 0 ? freight.oversizeFirstCents + freight.oversizeAdditionalCents * (oversize - 1) : 0;
  const perSqft = freight.perSqftCents > 0 ? Math.round(Math.max(area, freight.minSqft) * freight.perSqftCents) : 0;
  return perShutter + oversizeCents + perSqft;
}

/** Splits `total` across `weights` in proportion, so the parts always add back to exactly `total`. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum === 0) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  let given = 0;
  return weights.map((weight, i) => {
    if (i === weights.length - 1) return total - given;
    const part = Math.round((total * weight) / sum);
    given += part;
    return part;
  });
}

function installFor(rate: ShutterInstallRate, w: QuoteWindow): number {
  if (!rate) return 0;
  const quantity = quantityFor(rate.basis, {
    treatment: "shutters", count: w.quantity, widthEighths: w.widthEighths, heightEighths: w.heightEighths,
    hardSurface: false, highLadder: false, motorized: false,
  });
  return quantity * rate.rateCents;
}

/**
 * Prices one quote. Per shutter: billed area × the line's rate is the base; percent
 * add-ons are each a share of that base (they do not stack on each other); the rest are
 * flat or per unit. Then × quantity. Freight is added once for the order and shared
 * across windows by cost. Client price = (product + freight) × markup + install; the
 * install charge is never marked up. A line with its own client price uses that instead:
 * billed area × the price (install and freight included), plus its add-ons × the product
 * multiple the price implies. The quote has a price only when every window does.
 */
export function priceQuote(rates: ShutterRates, install: ShutterInstallRate, input: QuoteInput): PricedQuote {
  const lines = new Map(rates.lines.filter((l) => l.supplier === input.supplier).map((l) => [l.id, l]));
  const options = new Map(rates.options.filter((o) => o.supplier === input.supplier).map((o) => [o.id, o]));

  const partial = input.windows.map((w) => {
    const line = lines.get(w.lineId);
    if (!line) throw new Error(`${w.room || "A window"}: pick a ${supplierLabel(input.supplier)} line`);
    // The window size as entered; the supplier bills (and we install) on the shutter with its frame.
    const framed = { widthEighths: w.widthEighths + line.frameAddEighths, heightEighths: w.heightEighths + line.frameAddEighths };
    const sqft = sqftOf(framed.widthEighths, framed.heightEighths);
    const billedSqft = Math.max(sqft, line.minSqft);
    const base = billedSqft * line.costCentsPerSqft;
    let perShutter = base;
    for (const [id, count] of Object.entries(w.options)) {
      const option = options.get(id);
      if (!option || count <= 0 || option.kind === "per_order") continue;
      if (option.kind === "percent") perShutter += (base * option.amount) / 10_000;
      else if (option.kind === "per_window") perShutter += option.amount;
      else if (option.kind === "per_panel") perShutter += option.amount * w.panels;
      else if (option.kind === "per_sqft") perShutter += option.amount * sqft;
      else perShutter += option.amount * count; // each, per_linear_ft
    }
    const costCents = Math.round(perShutter * w.quantity);
    const baseCents = Math.round(base * w.quantity);
    return {
      ...w, line, lineName: line.name, sqft, billedSqft, framedWidthEighths: framed.widthEighths,
      costCents, addOnCents: costCents - baseCents, installCents: installFor(install, { ...w, ...framed }),
    };
  });

  let orderCostCents = 0;
  for (const [id, count] of Object.entries(input.orderOptions)) {
    const option = options.get(id);
    if (option?.kind === "per_order" && count > 0) orderCostCents += option.amount * count;
  }

  const freightRule = rates.freight.find((f) => f.supplier === input.supplier) ?? NO_FREIGHT(input.supplier);
  // Oversize is the shutter's width, frame included.
  const freightCents = freightFor(freightRule, partial.map((w) => ({ ...w, widthEighths: w.framedWidthEighths })));
  const productCostCents = partial.reduce((s, w) => s + w.costCents, 0) + orderCostCents;
  const installCents = partial.reduce((s, w) => s + w.installCents, 0);
  const supplierCostCents = productCostCents + freightCents;
  const markup = rates.markupHundredths;

  // Order-level costs (freight, per-order add-ons) are shared across windows by product cost,
  // so each window's client price is complete and the window prices add up to the total.
  const shared = allocate(freightCents + orderCostCents, partial.map((w) => w.costCents));
  const freightShare = allocate(freightCents, partial.map((w) => w.costCents));
  const orderShare = allocate(orderCostCents, partial.map((w) => w.costCents));
  const priced: PricedWindow[] = partial.map(({ line, addOnCents, framedWidthEighths: _framed, ...w }, i) => {
    let priceCents: number | null = null;
    if (line.clientCentsPerSqft !== null) {
      // The line's own price covers the shutter, its freight and install. Add-ons (and its
      // share of per-order ones) get the product markup that price implies, never below cost.
      const productCentsPerSqft = line.clientCentsPerSqft - (install?.basis === "sq_ft" ? install.rateCents : 0);
      const multiple = Math.max(1, productCentsPerSqft / line.costCentsPerSqft);
      priceCents = Math.round(w.billedSqft * line.clientCentsPerSqft * w.quantity) + Math.round((addOnCents + orderShare[i]) * multiple);
    } else if (markup !== null) {
      priceCents = Math.round(((w.costCents + shared[i]) * markup) / 100) + w.installCents;
    }
    return { ...w, freightCents: freightShare[i], priceCents };
  });
  const priceCents = priced.some((w) => w.priceCents === null) ? null : priced.reduce((s, w) => s + (w.priceCents ?? 0), 0);

  return {
    windows: priced,
    orderCostCents,
    productCostCents,
    freightCents,
    installCents,
    supplierCostCents,
    priceCents,
    marginCents: priceCents === null ? null : priceCents - supplierCostCents - installCents,
    shutterCount: partial.reduce((s, w) => s + w.quantity, 0),
  };
}

/**
 * Reads a typed size: "35", "35 5/8", "35-5/8", "35.625" or "5/8". Rounds to the nearest
 * eighth, like every stored measurement. Null when it is blank, zero or not a size.
 */
export function parseInches(text: string): number | null {
  const t = text.trim().replace(/["″]/g, "").trim();
  if (t === "") return null;
  let inches: number;
  const mixed = /^(\d+)?(?:[\s-]+)?(?:(\d+)\/(\d+))?$/.exec(t);
  if (/^\d+(\.\d+)?$/.test(t)) inches = Number(t);
  else if (mixed && (mixed[1] || mixed[2]) && t.includes("/")) {
    const whole = mixed[1] ? Number(mixed[1]) : 0;
    const den = Number(mixed[3]);
    if (!den) return null;
    inches = whole + Number(mixed[2]) / den;
  } else return null;
  const eighths = Math.round(inches * 8);
  return eighths > 0 && eighths <= 4800 ? eighths : null;
}

/** The guide's install rate as the pricing takes it: per whole sq ft, rounded up per shutter. */
export const guideInstallRate = (rates: ShutterRates): ShutterInstallRate =>
  rates.installCentsPerSqft === null ? null : { basis: "sq_ft", rateCents: rates.installCentsPerSqft };

export const formatSqft =(sqft: number) => (Math.round(sqft * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** "1.91" → 191. Blank is null (not set). */
export function parseMarkup(input: string): number | null {
  const cleaned = input.replace(/[×x\s]/gi, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error("Enter the markup as a multiple, like 1.9");
  const hundredths = Math.round(Number(cleaned) * 100);
  if (hundredths < 100 || hundredths > 1000) throw new Error("Enter a markup between 1 and 10");
  return hundredths;
}

/** The client-facing summary for the clipboard. Never includes costs, freight or margin. */
export function clientSummary(quote: PricedQuote, formatEighths: (n: number) => string, formatCents: (n: number) => string): string {
  if (quote.priceCents === null) return "";
  const rows = quote.windows.map((w) => {
    const size = `${formatEighths(w.widthEighths)} × ${formatEighths(w.heightEighths)}`;
    const count = w.quantity > 1 ? ` (${w.quantity})` : "";
    return `${w.room || "Window"}${count}: ${w.lineName} shutters, ${size}: ${formatCents(w.priceCents ?? 0)}`;
  });
  return [...rows, `Total: ${formatCents(quote.priceCents)}`, "Includes installation and shipping."].join("\n");
}

// ---- Rates: validation and paste import --------------------------------------------------

const cents = z.number().int().min(0).max(100_000_000);
export const ratesSchema = z.object({
  lines: z.array(z.object({
    supplier: z.enum(SUPPLIERS),
    name: z.string().trim().min(1, "Every line needs a name").max(120),
    costCentsPerSqft: cents.refine((n) => n > 0, "Every line needs a $/sq ft cost"),
    minSqft: z.number().int().min(0).max(100),
    clientCentsPerSqft: cents.refine((n) => n > 0, "A client price must be more than $0").nullable().default(null),
    frameAddEighths: z.number().int().min(0, "A frame can't take away from the size").max(96, "A frame adds at most 12 inches").default(0),
  })),
  options: z.array(z.object({
    supplier: z.enum(SUPPLIERS),
    name: z.string().trim().min(1, "Every add-on needs a name").max(200),
    kind: z.enum(OPTION_KINDS),
    amount: cents,
  })),
  freight: z.array(z.object({
    supplier: z.enum(SUPPLIERS),
    firstCents: cents, additionalCents: cents, oversizeWidthEighths: z.number().int().min(0).max(4800),
    oversizeFirstCents: cents, oversizeAdditionalCents: cents, perSqftCents: cents, minSqft: z.number().int().min(0).max(10_000),
  })),
  markupHundredths: z.number().int().min(100).max(1000).nullable(),
  installCentsPerSqft: cents.nullable(),
});
export type RatesInput = z.infer<typeof ratesSchema>;

const KIND_WORDS: [RegExp, OptionKind][] = [
  [/^(%|percent|pct)$/i, "percent"],
  [/^(window|per window|per_window)$/i, "per_window"],
  [/^(panel|per panel|per_panel)$/i, "per_panel"],
  [/^(sq ?ft|sqft|per sq ?ft|per_sqft)$/i, "per_sqft"],
  [/^(ft|foot|linear ft|per foot|per_linear_ft)$/i, "per_linear_ft"],
  [/^(each|ea)$/i, "each"],
  [/^(order|per order|per_order)$/i, "per_order"],
];

/**
 * Reads pasted add-on rows, one per line: `name | kind | amount` (tabs also work).
 * Amount is dollars, or a percent when the kind is % (or the amount ends in %).
 */
export function parseOptionRows(text: string, supplier: Supplier): { rows: Omit<ShutterOption, "id">[]; errors: string[] } {
  const rows: Omit<ShutterOption, "id">[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/\t|\|/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) { errors.push(`Row ${i + 1}: needs name | kind | amount`); return; }
    const amountText = parts[parts.length - 1];
    const kindText = parts[parts.length - 2];
    const name = parts.slice(0, -2).join(" ");
    let kind = KIND_WORDS.find(([re]) => re.test(kindText))?.[1];
    if (amountText.endsWith("%")) kind = "percent";
    if (!kind) { errors.push(`Row ${i + 1}: "${kindText}" is not a kind`); return; }
    const number = Number(amountText.replace(/[$,%\s]/g, ""));
    if (!Number.isFinite(number) || number < 0) { errors.push(`Row ${i + 1}: "${amountText}" is not an amount`); return; }
    rows.push({ supplier, name, kind, amount: Math.round(number * 100) });
  });
  return { rows, errors };
}
