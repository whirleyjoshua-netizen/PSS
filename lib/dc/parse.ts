import { parse, type HTMLElement } from "node-html-parser";
import { parseMoney } from "./money";
import type { DcLine, ParseResult } from "./types";

const clean = (text: string): string => text.replace(/[\s ]+/g, " ").trim();
const cells = (row: HTMLElement): HTMLElement[] =>
  row.childNodes.filter((n): n is HTMLElement => (n as HTMLElement).tagName === "TD");
const refuse = (outcome: "no-costs" | "incomplete" | "unreadable" | "no-po", detail: string): ParseResult =>
  ({ ok: false, refusal: { outcome, detail } });

const PO = /^PSS-(\d{4,})$/;
const ERROR = /\*\*\* Error: (.+?) \*\*\*/;

/**
 * Reads a Direct Connect Dealer Copy. Pure: no I/O. Scripts are never run and images never
 * fetched (node-html-parser only builds a tree). Everything is found by its printed label or
 * header text, never by position, because DC changes the columns with the report options.
 * The parser checks its own arithmetic against DC's printed totals and refuses on any
 * mismatch: a wrong price imported silently is worse than a refusal the owner can see.
 */
export function parseDealerCopy(html: string): ParseResult {
  const root = parse(html);
  const tds = root.querySelectorAll("td");
  const valueAfter = (label: string): string | null => {
    const cell = tds.find((td) => clean(td.text) === label);
    const next = cell?.nextElementSibling;
    return next ? clean(next.text) : null;
  };

  const quoteNo = valueAfter("Quote #:");
  const poReference = valueAfter("PO Reference:");
  if (!quoteNo || !/^\d+$/.test(quoteNo) || poReference === null) return refuse("unreadable", "No quote number or PO line");
  if (!tds.some((td) => clean(td.text) === "DEALER COSTS")) return refuse("no-costs", `Quote ${quoteNo}`);
  const po = PO.exec(poReference);
  if (!po) return refuse("no-po", `Quote ${quoteNo} has PO Reference "${poReference}"`);

  const rows = root.querySelectorAll("tr");
  const header = rows.find((row) => {
    const texts = cells(row).map((c) => clean(c.text));
    return texts.includes("Item") && texts.includes("Description");
  });
  if (!header) return refuse("unreadable", "No column header row");
  const heads = cells(header).map((c) => clean(c.text));
  const factorAt = heads.indexOf("Factor");
  const col = {
    item: heads.indexOf("Item"), qty: heads.indexOf("Qty"), description: heads.indexOf("Description"),
    base: heads.indexOf("Amt"), promotion: heads.indexOf("Promotion"), options: heads.indexOf("Options"),
    factor: factorAt, unit: heads.indexOf("Unit", factorAt), extended: heads.indexOf("Extended", factorAt),
  };
  if (Object.values(col).some((i) => i < 0)) return refuse("unreadable", `Missing a column in: ${heads.join(", ")}`);

  const lines: DcLine[] = [];
  for (const row of rows) {
    const c = cells(row);
    if (c.length <= col.extended) continue;
    const item = clean(c[col.item].text);
    const qtyText = clean(c[col.qty].text);
    if (!/^\d+$/.test(item) || !/^\d+$/.test(qtyText)) continue;
    const position = Number(item);

    const optionsRow = row.nextElementSibling;
    const optionsText = optionsRow ? clean(optionsRow.text) : "";
    const error = ERROR.exec(optionsText);
    if (error) return refuse("incomplete", `Line ${position}: ${error[1]}`);

    const options: [string, string][] = [];
    for (const optionRow of optionsRow?.querySelectorAll("tr") ?? []) {
      const pair = cells(optionRow);
      if (pair.length !== 2) continue;
      const label = clean(pair[0].text);
      if (!label.endsWith(":") || label.startsWith("***")) continue;
      options.push([label.slice(0, -1), clean(pair[1].text)]);
    }
    const option = (name: string) => options.find(([label]) => label === name)?.[1];
    const collection = option("Collection");
    if (!collection) return refuse("unreadable", `Line ${position} has no Collection`);

    const money = [col.base, col.promotion, col.options, col.unit, col.extended].map((i) => parseMoney(c[i].text));
    if (money.some((m) => m === null)) return refuse("unreadable", `Line ${position} has an unreadable amount`);
    const [baseCents, promotionCents, optionsCents, costUnitCents, costExtendedCents] = money as number[];
    const factor = clean(c[col.factor].text);

    lines.push({
      position, qty: Number(qtyText), room: option("Location") ?? "", description: clean(c[col.description].text),
      collection, baseCents, promotionCents, optionsCents,
      msrpUnitCents: baseCents + promotionCents + optionsCents,
      costFactor: /^\d+(\.\d+)?$/.test(factor) ? factor : null,
      costUnitCents, costExtendedCents, options,
    });
  }
  if (ERROR.test(clean(root.text))) return refuse("incomplete", "An error line that belongs to no product line");
  if (lines.length === 0) return refuse("unreadable", `Quote ${quoteNo} has no product lines`);

  const total = (label: string) => {
    const text = valueAfter(label);
    return text === null ? null : parseMoney(text);
  };
  const subtotalCents = total("Product Sub-Total");
  const handlingFeeCents = total("Handling Fees");
  const oversizedFeeCents = total("Oversized Fees") ?? 0;
  const dealerTotalCents = total("Dealer Total");
  if (subtotalCents === null || handlingFeeCents === null || dealerTotalCents === null) {
    return refuse("unreadable", `Quote ${quoteNo} totals are missing`);
  }
  const sumExtended = lines.reduce((sum, line) => sum + line.costExtendedCents, 0);
  if (sumExtended !== subtotalCents || subtotalCents + handlingFeeCents + oversizedFeeCents !== dealerTotalCents) {
    return refuse("unreadable", `Quote ${quoteNo} totals do not add up`);
  }

  return {
    ok: true,
    quote: {
      quoteNo, poReference, projectNo: Number(po[1]), clientName: valueAfter("Client:") ?? "",
      lines, subtotalCents, handlingFeeCents, oversizedFeeCents, dealerTotalCents,
    },
  };
}
