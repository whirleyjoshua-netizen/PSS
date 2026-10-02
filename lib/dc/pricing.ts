import { sellUnitCents } from "./money";

export type PricingLine = { position: number; qty: number; collection: string; msrpUnitCents: number; costExtendedCents: number; pctOverride: number | null };
export type InstallChoice = { id: string; kind: "estimate" | "final"; totalCents: number; createdAt: Date };
export type PricingInput = {
  lines: PricingLine[]; rules: Record<string, number>;
  handlingFeeCents: number; oversizedFeeCents: number; dealerTotalCents: number;
  waiveHandling: boolean; install: InstallChoice | null; noInstall: boolean;
};
export type PricedLine = { position: number; pct: number | null; source: "rule" | "override" | "missing"; sellUnitCents: number | null; sellExtendedCents: number | null; marginCents: number | null };
export type PricedVersion = {
  /**
   * handlingChargedCents is the fee as its own printed line: always 0 now, and kept for versions sent
   * before the fee was built into line prices. handlingFoldedCents is the part of it inside the line prices.
   * Installation likewise: installCents is the install price chosen, installFoldedCents the part of it inside
   * the line prices, installLineCents the part printed as its own line (0 now; versions sent before 038).
   */
  lines: PricedLine[]; productsCents: number | null; handlingChargedCents: number; handlingFoldedCents: number; oversizedCents: number;
  installCents: number; installFoldedCents: number; installLineCents: number; installQuoteId: string | null; clientTotalCents: number | null;
  costCents: number; marginCents: number | null; waiveHandling: boolean; blockers: string[];
};
export type SendContext = { hasTerms: boolean; isLatest: boolean; versionStatus: string; jobStatus: string; customerEmail: string | null };

const key = (collection: string) => collection.trim().toLowerCase();

export function ruleFor(rules: Record<string, number>, collection: string): number | null {
  const wanted = key(collection);
  for (const [name, pct] of Object.entries(rules)) if (key(name) === wanted) return pct;
  return null;
}

/**
 * Builds an amount into the line prices (owner, 2026-10-02: the quote shows no handling or installation line).
 * "price": each line takes a share in proportion to its markup price (the handling fee).
 * "shade": every unit takes the same share (installation, divided evenly per shade).
 * Shares are whole cents per unit, so every line still reads unit × qty; the cents left over go to the
 * lowest-quantity lines first. Free lines take none (unless every line is free), and 0 or less folds
 * nothing. With a qty-1 priced line the whole amount goes in; with none, under the smallest qty in cents
 * may be left off. Never more than the amount. Answers the extra cents per unit for each line, in order.
 */
export function foldFee(lines: { qty: number; extendedCents: number }[], amountCents: number, split: "price" | "shade" = "price"): number[] {
  const extra = lines.map(() => 0);
  if (amountCents <= 0) return extra;
  const all = lines.map((_, i) => i);
  // Only priced lines carry it: a free accessory stays free. If every line is free, they share it.
  const paid = all.filter((i) => lines[i].extendedCents > 0);
  const takers = paid.length > 0 ? paid : all.filter((i) => lines[i].extendedCents === 0);
  if (split === "shade") {
    const shades = takers.reduce((sum, i) => sum + lines[i].qty, 0);
    for (const i of takers) extra[i] = shades > 0 ? Math.floor(amountCents / shades) : 0;
  } else {
    const total = paid.reduce((sum, i) => sum + lines[i].extendedCents, 0);
    for (const i of paid) extra[i] = Math.floor(Math.floor((amountCents * lines[i].extendedCents) / total) / lines[i].qty);
  }
  let left = amountCents - extra.reduce((sum, e, i) => sum + e * lines[i].qty, 0);
  for (const i of [...takers].sort((a, b) => lines[a].qty - lines[b].qty || a - b)) {
    const add = Math.floor(left / lines[i].qty);
    extra[i] += add;
    left -= add * lines[i].qty;
  }
  return extra;
}

/**
 * The whole price of one quote version. Pure, and the only place a sell price is computed:
 * the review screen, the Send action's recomputation and the contract all call this.
 */
export function priceVersion(input: PricingInput): PricedVersion {
  // Keyed like ruleFor, so "Duette" and "DUETTE" are named once (first spelling wins).
  const missing = new Map<string, string>();
  const marked = input.lines.map((line) => {
    const rule = ruleFor(input.rules, line.collection);
    const pct = line.pctOverride ?? rule;
    if (pct === null && !missing.has(key(line.collection))) missing.set(key(line.collection), line.collection.trim());
    return { line, pct, unit: pct === null ? null : sellUnitCents(line.msrpUnitCents, pct) };
  });

  const blockers = [...missing.values()].map((name) => `Set a markup for ${name} first.`);
  if (!input.install && !input.noInstall) blockers.push("Save an installation price, or tick No installation.");

  const feeCents = input.waiveHandling ? 0 : input.handlingFeeCents;
  const install = input.noInstall ? null : input.install;
  const installCents = install?.totalCents ?? 0;
  // The fee and installation can only be spread once every line has a price.
  const sizes = marked.map((m) => ({ qty: m.line.qty, extendedCents: (m.unit ?? 0) * m.line.qty }));
  const handlingExtra = missing.size > 0 ? marked.map(() => 0) : foldFee(sizes, feeCents, "price");
  const installExtra = missing.size > 0 ? marked.map(() => 0) : foldFee(sizes, installCents, "shade");
  const extra = handlingExtra.map((h, i) => h + installExtra[i]);
  const lines: PricedLine[] = marked.map(({ line, pct, unit }, i) => {
    if (pct === null || unit === null) {
      return { position: line.position, pct: null, source: "missing", sellUnitCents: null, sellExtendedCents: null, marginCents: null };
    }
    const sell = unit + extra[i];
    return {
      position: line.position, pct, source: line.pctOverride === null ? "rule" : "override",
      sellUnitCents: sell, sellExtendedCents: sell * line.qty,
      // On the markup price: the fee is the manufacturer's, not margin.
      marginCents: unit * line.qty - line.costExtendedCents,
    };
  });

  const folded = (per: number[]) => per.reduce((sum, e, i) => sum + e * marked[i].line.qty, 0);
  const handlingFoldedCents = folded(handlingExtra);
  const installFoldedCents = folded(installExtra);
  const productsCents = missing.size > 0 ? null : lines.reduce((sum, l) => sum + (l.sellExtendedCents ?? 0), 0);
  const clientTotalCents = productsCents === null ? null : productsCents + input.oversizedFeeCents;
  return {
    lines, productsCents, handlingChargedCents: 0, handlingFoldedCents, oversizedCents: input.oversizedFeeCents,
    installCents, installFoldedCents, installLineCents: 0, installQuoteId: install?.id ?? null, clientTotalCents,
    costCents: input.dealerTotalCents,
    // Product margin: the installation charged (built into the lines) is excluded.
    marginCents: clientTotalCents === null ? null : clientTotalCents - installFoldedCents - input.dealerTotalCents,
    waiveHandling: input.waiveHandling, blockers,
  };
}

/** The newest final install price, else the newest estimate. */
export function pickInstallQuote(quotes: InstallChoice[]): InstallChoice | null {
  const newest = (kind: InstallChoice["kind"]) =>
    quotes.filter((q) => q.kind === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  return newest("final") ?? newest("estimate");
}

export function sendBlockers(priced: PricedVersion, context: SendContext): string[] {
  const reasons = [...priced.blockers];
  if (!context.hasTerms) reasons.push("Add your contract terms on the Documents page first.");
  if (!context.isLatest) reasons.push("A newer version of this quote has arrived. Review that one.");
  if (context.versionStatus !== "draft") reasons.push("This version has already been sent.");
  if (context.jobStatus === "lost") reasons.push("This job is marked Lost.");
  if (!context.customerEmail?.trim()) reasons.push("Add the client's email address to the job first.");
  return reasons;
}

/** Every figure the client will be charged, so a change to any of them changes the fingerprint. */
export function pricingFingerprint(p: PricedVersion): string {
  return JSON.stringify({
    lines: p.lines.map((l) => [l.position, l.pct, l.sellUnitCents, l.sellExtendedCents]),
    handling: p.handlingChargedCents, folded: p.handlingFoldedCents, waive: p.waiveHandling, oversized: p.oversizedCents,
    install: [p.installQuoteId, p.installCents, p.installFoldedCents, p.installLineCents], total: p.clientTotalCents,
  });
}
