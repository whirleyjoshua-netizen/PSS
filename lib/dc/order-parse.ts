import { parse } from "node-html-parser";
import { parseMoney } from "./money";
import { clean, PO, PO_MAX } from "./parse";

/** What Hunter Douglas confirmed it will build, in cents. Totals as printed; tax is HD's sales tax to PSS. */
export type HdOrder = {
  orderNo: string;
  poReference: string;
  /** The number inside "PSS-1042". */
  projectNo: number;
  /** "A" for PSS-1042, "B"–"Z" for PSS-1042-B … PSS-1042-Z, as on a Dealer Copy. */
  option: string;
  /** YYYY-MM-DD. */
  orderDate: string;
  status: string;
  subtotalCents: number;
  oversizeCents: number;
  handlingCents: number;
  taxCents: number;
  totalCents: number;
};

/** What HD charges before its sales tax: the figure a Dealer Copy's dealer total is comparable to. */
export const orderBeforeTaxCents = (o: Pick<HdOrder, "subtotalCents" | "oversizeCents" | "handlingCents">): number =>
  o.subtotalCents + o.oversizeCents + o.handlingCents;

/** DC's "Confirming Receipt of Quote" email: the order was submitted, not yet confirmed by HD. */
export type HdReceipt = { quoteNo: string; poReference: string; projectNo: number; option: string };

export type OrderRefusal = { ok: false; outcome: "unreadable" | "no-po"; detail: string; orderNo?: string; poReference?: string };

const pss = (poReference: string): { projectNo: number; option: string } | null => {
  const po = poReference.length <= PO_MAX ? PO.exec(poReference) : null;
  return po ? { projectNo: Number(po[1]), option: po[2] ?? "A" } : null;
};

/**
 * Reads HD's "New Order # … for Sidemark: …" confirmation. Pure: no I/O, images never fetched.
 * Fields are found by their printed labels. The totals are checked against each other and any
 * mismatch is refused: a wrong cost recorded silently is worse than a refusal the owner sees.
 */
export function parseOrderConfirmation(html: string): { ok: true; order: HdOrder } | OrderRefusal {
  const root = parse(html);
  // The header prints "<b>Order Number:</b> 14286505" inside one cell.
  const field = (label: string): string | null => {
    const bold = root.querySelectorAll("b").find((b) => clean(b.text) === label);
    const cell = bold?.closest("td");
    return cell ? clean(clean(cell.text).slice(clean(bold!.text).length)) : null;
  };
  // The totals table prints the label in one cell and the amount in the next.
  const total = (label: string): number | null => {
    const cell = root.querySelectorAll("td").find((td) => clean(td.text) === label);
    const next = cell?.nextElementSibling;
    return next ? parseMoney(next.text) : null;
  };

  const orderNo = field("Order Number:");
  if (!orderNo || !/^\d+$/.test(orderNo)) return { ok: false, outcome: "unreadable", detail: "No order number" };
  const order = `HD order ${orderNo}`;
  const poReference = field("PO Number:");
  if (poReference === null) return { ok: false, outcome: "unreadable", detail: `${order} has no PO Number`, orderNo };
  const job = pss(poReference);
  if (!job) return { ok: false, outcome: "no-po", detail: `${order} has PO "${poReference}"`, orderNo, poReference };
  const ids = { orderNo, poReference };

  const status = field("Order Status:") ?? "";
  if (status !== "Confirmed") return { ok: false, outcome: "unreadable", detail: `${order} has status "${status}"`, ...ids };
  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(field("Order Date:") ?? "");
  if (!date) return { ok: false, outcome: "unreadable", detail: `${order} has no order date`, ...ids };

  const subtotalCents = total("Order Subtotal:");
  const oversizeCents = total("Oversize Surcharges:");
  const handlingCents = total("Handling Surcharges:");
  const taxCents = total("Tax Amount:");
  const totalCents = total("Total Amount (USD):");
  if (subtotalCents === null || oversizeCents === null || handlingCents === null || taxCents === null || totalCents === null) {
    return { ok: false, outcome: "unreadable", detail: `${order} totals are missing`, ...ids };
  }
  if (subtotalCents + oversizeCents + handlingCents + taxCents !== totalCents) {
    return { ok: false, outcome: "unreadable", detail: `${order} totals do not add up`, ...ids };
  }
  return {
    ok: true,
    order: {
      orderNo, poReference, ...job, orderDate: `${date[3]}-${date[1]}-${date[2]}`, status,
      subtotalCents, oversizeCents, handlingCents, taxCents, totalCents,
    },
  };
}

/** "…receipt of DirectConnect quote 22293638.The P.O. for this order is: PSS-1042-E and the Sidemark is: …" */
const RECEIPT = /quote (\d+)\.\s*The P\.O\. for this order is: (.*?) and the Sidemark is:/;

/** Reads DC's "Confirming Receipt of Quote #…" email. Pure. */
export function parseOrderReceipt(html: string): { ok: true; receipt: HdReceipt } | { ok: false; outcome: "unreadable" | "no-po"; detail: string } {
  const match = RECEIPT.exec(clean(parse(html).text));
  if (!match) return { ok: false, outcome: "unreadable", detail: "No quote number or PO" };
  const [, quoteNo, poReference] = match;
  const job = pss(poReference);
  if (!job) return { ok: false, outcome: "no-po", detail: `Quote ${quoteNo} has PO "${poReference}"` };
  return { ok: true, receipt: { quoteNo, poReference, ...job } };
}
