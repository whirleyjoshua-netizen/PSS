/**
 * Turns a priced shutter guide quote into the lines of an official quote version (the same
 * dc_quote_lines the Direct Connect import writes), so review, Send, the contract, signing and
 * the deposit all work on it unchanged. Pure: priced quote in, lines and totals out.
 *
 * Each line's MSRP is the client price and its markup is pinned at 100%, so the price the
 * guide showed is exactly the price the quote charges. Install and freight are already in
 * that price, so the version carries no handling fee and no separate installation.
 */
import { allocate, supplierLabel, type PricedQuote, type ShutterOption, type Supplier } from "./shutter-pricing";

export type ShutterQuoteLine = {
  position: number; qty: number; room: string; description: string; collection: string;
  msrpUnitCents: number; costUnitCents: number; costExtendedCents: number; options: [string, string][];
};

export type ShutterQuoteVersion = {
  lines: ShutterQuoteLine[];
  /** What the supplier bills: product, per-order add-ons and freight. */
  dealerTotalCents: number;
  clientTotalCents: number;
};

/** "36 5/8" with plain characters, as a Dealer Copy prints a size. */
export function plainInches(eighths: number): string {
  const inches = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (!rest) return String(inches);
  const g = rest % 2 === 0 ? (rest % 4 === 0 ? 4 : 2) : 1;
  return `${inches} ${rest / g}/${8 / g}`;
}

export function buildShutterQuote(quote: PricedQuote, supplier: Supplier, options: ShutterOption[]): ShutterQuoteVersion {
  if (quote.priceCents === null) throw new Error("Every window needs a client price before it can become a quote.");
  if (quote.windows.length === 0) throw new Error("Add at least one window.");
  const names = new Map(options.map((o) => [o.id, o.name]));
  // Per-order add-ons (a custom color) are shared across windows by cost, as the price did.
  const orderShare = allocate(quote.orderCostCents, quote.windows.map((w) => w.costCents));
  const lines: ShutterQuoteLine[] = [];
  quote.windows.forEach((w, i) => {
    const price = w.priceCents ?? 0;
    const cost = w.costCents + w.freightCents + orderShare[i];
    const picked = Object.entries(w.options).filter(([, n]) => n > 0).map(([id, n]) => {
      const name = names.get(id) ?? "Add-on";
      return n > 1 ? `${name} (${n})` : name;
    });
    const description = `${supplierLabel(supplier)} ${w.lineName} shutters${picked.length ? `, ${picked.join(", ")}` : ""}`;
    const base = {
      room: w.room.trim(), description, collection: `${supplierLabel(supplier)} ${w.lineName}`,
      options: [["Order Width", plainInches(w.widthEighths)], ["Order Height", plainInches(w.heightEighths)], ["Panels", String(w.panels)]] as [string, string][],
    };
    if (price % w.quantity === 0) {
      lines.push({ ...base, position: lines.length + 1, qty: w.quantity, msrpUnitCents: price / w.quantity,
        costUnitCents: Math.round(cost / w.quantity), costExtendedCents: cost });
    } else {
      // The price doesn't split into equal cents per shutter: one line each, so the total stays exact.
      const ones = Array.from({ length: w.quantity }, () => 1);
      const prices = allocate(price, ones);
      const costs = allocate(cost, ones);
      prices.forEach((p, k) => lines.push({ ...base, position: lines.length + 1, qty: 1, msrpUnitCents: p, costUnitCents: costs[k], costExtendedCents: costs[k] }));
    }
  });
  return { lines, dealerTotalCents: quote.supplierCostCents, clientTotalCents: quote.priceCents };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The cost sheet filed with the quote as its source: dealer cost, freight, install and margin.
 * Filed as a dealer copy, which the database refuses to share with a client.
 */
export function costSheetHtml(input: {
  quote: PricedQuote; supplier: Supplier; jobLabel: string; actor: string; at: Date; formatCents: (n: number) => string;
}): string {
  const { quote, formatCents: money } = input;
  const rows = quote.windows.map((w) => `<tr><td>${esc(w.room || "Window")}</td><td>${esc(w.lineName)}</td><td>${plainInches(w.widthEighths)} × ${plainInches(w.heightEighths)}</td><td>${w.quantity}</td><td>${w.billedSqft.toFixed(2)}</td><td>${money(w.costCents)}</td><td>${money(w.freightCents)}</td><td>${money(w.installCents)}</td><td>${money(w.priceCents ?? 0)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shutter cost sheet</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#1e1e1e}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;font-size:13px}th{font-size:11px;text-transform:uppercase}</style></head><body>
<h1>Shutter cost sheet: ${esc(input.jobLabel)}</h1>
<p>${esc(supplierLabel(input.supplier))}. Made from the shutter price guide by ${esc(input.actor)} on ${input.at.toISOString().slice(0, 10)}. Dealer cost: team only, never shown to the client.</p>
<table><thead><tr><th>Room</th><th>Line</th><th>Size (in)</th><th>Qty</th><th>Billed sq ft each</th><th>Product cost</th><th>Freight</th><th>Install</th><th>Client price</th></tr></thead><tbody>${rows}</tbody></table>
<p>Per-order add-ons: ${money(quote.orderCostCents)}. Freight: ${money(quote.freightCents)}. Supplier bills: ${money(quote.supplierCostCents)}. Install charge: ${money(quote.installCents)}. Client price: ${money(quote.priceCents ?? 0)}. Left after supplier and install: ${money(quote.marginCents ?? 0)}.</p>
</body></html>`;
}
