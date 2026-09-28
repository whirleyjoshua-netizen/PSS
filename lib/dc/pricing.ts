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
  lines: PricedLine[]; productsCents: number | null; handlingChargedCents: number; oversizedCents: number;
  installCents: number; installQuoteId: string | null; clientTotalCents: number | null;
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
 * The whole price of one quote version. Pure, and the only place a sell price is computed:
 * the review screen, the Send action's recomputation and the contract all call this.
 */
export function priceVersion(input: PricingInput): PricedVersion {
  // Keyed like ruleFor, so "Duette" and "DUETTE" are named once (first spelling wins).
  const missing = new Map<string, string>();
  const lines: PricedLine[] = input.lines.map((line) => {
    const rule = ruleFor(input.rules, line.collection);
    const pct = line.pctOverride ?? rule;
    if (pct === null) {
      if (!missing.has(key(line.collection))) missing.set(key(line.collection), line.collection.trim());
      return { position: line.position, pct: null, source: "missing", sellUnitCents: null, sellExtendedCents: null, marginCents: null };
    }
    const unit = sellUnitCents(line.msrpUnitCents, pct);
    const extended = unit * line.qty;
    return {
      position: line.position, pct, source: line.pctOverride === null ? "rule" : "override",
      sellUnitCents: unit, sellExtendedCents: extended, marginCents: extended - line.costExtendedCents,
    };
  });

  const blockers = [...missing.values()].map((name) => `Set a markup for ${name} first.`);
  if (!input.install && !input.noInstall) blockers.push("Save an installation price, or tick No installation.");

  const handlingChargedCents = input.waiveHandling ? 0 : input.handlingFeeCents;
  const install = input.noInstall ? null : input.install;
  const installCents = install?.totalCents ?? 0;
  const productsCents = missing.size > 0 ? null : lines.reduce((sum, l) => sum + (l.sellExtendedCents ?? 0), 0);
  const clientTotalCents = productsCents === null ? null : productsCents + handlingChargedCents + input.oversizedFeeCents + installCents;
  return {
    lines, productsCents, handlingChargedCents, oversizedCents: input.oversizedFeeCents,
    installCents, installQuoteId: install?.id ?? null, clientTotalCents,
    costCents: input.dealerTotalCents,
    // Product margin: installation is excluded.
    marginCents: clientTotalCents === null ? null : clientTotalCents - installCents - input.dealerTotalCents,
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
  if (!context.hasTerms) reasons.push("Upload your contract terms in Settings first.");
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
    handling: p.handlingChargedCents, waive: p.waiveHandling, oversized: p.oversizedCents,
    install: [p.installQuoteId, p.installCents], total: p.clientTotalCents,
  });
}
