"use client";

import { useState } from "react";
import { formatEighths } from "@/lib/admin/measure-units";
import { formatCents } from "@/lib/admin/money";
import {
  COUNTED_KINDS, SUPPLIERS, clientSummary, formatSqft, parseInches, priceQuote, supplierLabel,
  type PricedQuote, type ShutterInstallRate, type ShutterRates, type Supplier,
} from "@/lib/admin/shutter-pricing";
import { basisLabel } from "@/lib/admin/install-pricing";

type Row = {
  key: number;
  room: string;
  lineId: string;
  width: string;
  height: string;
  quantity: number;
  panels: number;
  options: Record<string, number>;
};

const field = "min-h-11 border border-rule bg-white px-2 text-base";
let nextKey = 1;
const blankRow = (lineId: string): Row => ({ key: nextKey++, room: "", lineId, width: "", height: "", quantity: 1, panels: 2, options: {} });
const money = (cents: number | null) => (cents === null ? "—" : formatCents(cents));

export function ShutterQuote({ rates, install }: { rates: ShutterRates; install: ShutterInstallRate }) {
  const available = SUPPLIERS.filter((s) => rates.lines.some((l) => l.supplier === s));
  const [supplier, setSupplier] = useState<Supplier>(available[0] ?? "norman");
  const lines = rates.lines.filter((l) => l.supplier === supplier);
  const options = rates.options.filter((o) => o.supplier === supplier);
  const windowOptions = options.filter((o) => o.kind !== "per_order");
  const orderOptions = options.filter((o) => o.kind === "per_order");
  const [rows, setRows] = useState<Row[]>(() => [blankRow(lines[0]?.id ?? "")]);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  const update = (key: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setOption = (key: number, id: string, count: number) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, options: { ...r.options, [id]: count } } : r)));

  const switchSupplier = (next: Supplier) => {
    setSupplier(next);
    const first = rates.lines.find((l) => l.supplier === next)?.id ?? "";
    // Add-ons and lines belong to one supplier, so a switch clears them rather than carrying wrong ids.
    setRows((all) => all.map((r) => ({ ...r, lineId: first, options: {} })));
    setOrderCounts({});
  };

  // Only windows with a readable size are priced; the rest show what is missing.
  const ready = rows.map((r) => ({ row: r, w: parseInches(r.width), h: parseInches(r.height) }));
  const { quote, error } = ((): { quote: PricedQuote | null; error: string | null } => {
    const priced = ready.filter((x) => x.w !== null && x.h !== null);
    if (priced.length === 0) return { quote: null, error: null };
    try {
      return {
        quote: priceQuote(rates, install, {
          supplier,
          windows: priced.map(({ row, w, h }) => ({
            room: row.room, lineId: row.lineId, widthEighths: w!, heightEighths: h!,
            quantity: row.quantity, panels: row.panels, options: row.options,
          })),
          orderOptions: orderCounts,
        }),
        error: null,
      };
    } catch (e) {
      return { quote: null, error: e instanceof Error ? e.message : "This quote cannot be priced" };
    }
  })();
  const pricedByIndex = new Map<number, PricedQuote["windows"][number]>();
  if (quote) {
    let i = 0;
    for (const x of ready) if (x.w !== null && x.h !== null) pricedByIndex.set(x.row.key, quote.windows[i++]);
  }

  if (available.length === 0) {
    return <p className="text-sm">No shutter rates yet. Enter them on the Rates screen first.</p>;
  }

  const copy = async () => {
    if (!quote) return;
    await navigator.clipboard.writeText(clientSummary(quote, formatEighths, formatCents));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-semibold">Supplier</legend>
        {available.map((s) => (
          <label key={s} className={`flex min-h-11 cursor-pointer items-center gap-2 border px-4 text-sm ${s === supplier ? "border-charcoal bg-charcoal text-ivory" : "border-rule"}`}>
            <input type="radio" name="supplier" value={s} checked={s === supplier} onChange={() => switchSupplier(s)} className="sr-only" />
            {supplierLabel(s)}
          </label>
        ))}
      </fieldset>

      {!install ? (
        <p role="note" className="text-sm text-overdue">No installation rate is set, so prices leave install out. Set it on the Rates screen.</p>
      ) : (
        <p className="text-xs text-ink-soft">Installation: {formatCents(install.rateCents)} {basisLabel(install.basis).toLowerCase()}, rounded up per shutter.</p>
      )}
      {rates.markupHundredths === null ? (
        <p role="note" className="text-sm text-overdue">No markup is set, so this shows your cost only. Set it on the Rates screen.</p>
      ) : null}

      <ol className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const priced = pricedByIndex.get(row.key);
          const n = index + 1;
          return (
            <li key={row.key} aria-label={`Window ${n}`} className="flex flex-col gap-3 border border-rule bg-ivory p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">Room
                  <input value={row.room} onChange={(e) => update(row.key, { room: e.target.value })} className={`${field} w-40`} placeholder={`Window ${n}`} />
                </label>
                <label className="flex flex-col gap-1 text-sm">Line
                  <select value={row.lineId} onChange={(e) => update(row.key, { lineId: e.target.value })} className={`${field} w-56`}>
                    {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">Width (in)
                  <input value={row.width} inputMode="decimal" placeholder="35 5/8" onChange={(e) => update(row.key, { width: e.target.value })} className={`${field} w-28`} />
                </label>
                <label className="flex flex-col gap-1 text-sm">Height (in)
                  <input value={row.height} inputMode="decimal" placeholder="60" onChange={(e) => update(row.key, { height: e.target.value })} className={`${field} w-28`} />
                </label>
                <label className="flex flex-col gap-1 text-sm">How many
                  <input type="number" min={1} max={99} value={row.quantity} onChange={(e) => update(row.key, { quantity: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} className={`${field} w-20`} />
                </label>
                <label className="flex flex-col gap-1 text-sm">Panels
                  <input type="number" min={1} max={20} value={row.panels} onChange={(e) => update(row.key, { panels: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className={`${field} w-20`} />
                </label>
              </div>

              {windowOptions.length > 0 ? (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm">
                    Add-ons{Object.values(row.options).some((c) => c > 0) ? ` (${Object.values(row.options).filter((c) => c > 0).length})` : ""}
                  </summary>
                  <div className="grid gap-2 pt-2 sm:grid-cols-2">
                    {windowOptions.map((o) => COUNTED_KINDS.includes(o.kind) ? (
                      <label key={o.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>{o.name} <span className="text-ink-soft">({o.kind === "each" ? "how many" : "feet"})</span></span>
                        <input type="number" min={0} max={999} value={row.options[o.id] ?? 0} onChange={(e) => setOption(row.key, o.id, Math.max(0, Number(e.target.value) || 0))} className={`${field} w-20`} />
                      </label>
                    ) : (
                      <label key={o.id} className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" checked={(row.options[o.id] ?? 0) > 0} onChange={(e) => setOption(row.key, o.id, e.target.checked ? 1 : 0)} className="size-5" />
                        {o.name}
                      </label>
                    ))}
                  </div>
                </details>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                {priced ? (
                  <p>
                    {formatSqft(priced.sqft)} sq ft{priced.billedSqft > priced.sqft ? ` (billed as ${formatSqft(priced.billedSqft)})` : ""}
                    {" · "}Cost {formatCents(priced.costCents)}
                    {" · "}Install {formatCents(priced.installCents)}
                    {" · "}<strong>Price {money(priced.priceCents)}</strong>
                  </p>
                ) : (
                  <p className="text-ink-soft">Enter a width and height to price this window.</p>
                )}
                {rows.length > 1 ? (
                  <button type="button" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))} className="min-h-11 text-sm underline underline-offset-4">
                    Remove window {n}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={() => setRows((all) => [...all, blankRow(lines[0]?.id ?? "")])}
        className="min-h-11 self-start border border-charcoal px-4 text-sm">
        Add a window
      </button>

      {orderOptions.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">For the whole order</legend>
          {orderOptions.map((o) => (
            <label key={o.id} className="flex items-center justify-between gap-2 text-sm sm:max-w-md">
              {o.name}
              <input type="number" min={0} max={20} value={orderCounts[o.id] ?? 0}
                onChange={(e) => setOrderCounts((c) => ({ ...c, [o.id]: Math.max(0, Number(e.target.value) || 0) }))} className={`${field} w-20`} />
            </label>
          ))}
        </fieldset>
      ) : null}

      {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}

      {quote ? (
        <section aria-label="Totals" className="flex flex-col gap-2 border border-charcoal bg-ivory p-4 text-sm">
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            <dt>Shutters</dt><dd className="text-right">{quote.shutterCount}</dd>
            <dt>Product cost</dt><dd className="text-right">{formatCents(quote.productCostCents)}</dd>
            <dt>Freight</dt><dd className="text-right">{formatCents(quote.freightCents)}</dd>
            <dt>Your cost from {supplierLabel(supplier)}</dt><dd className="text-right">{formatCents(quote.supplierCostCents)}</dd>
            <dt>Installation charge</dt><dd className="text-right">{formatCents(quote.installCents)}</dd>
            <dt className="text-base font-semibold">Client price</dt><dd className="text-right text-base font-semibold">{money(quote.priceCents)}</dd>
            <dt>Profit on product (install charge not counted)</dt><dd className="text-right">{money(quote.marginCents)}</dd>
          </dl>
          <button type="button" onClick={copy} disabled={quote.priceCents === null}
            className="mt-2 min-h-11 self-start bg-charcoal px-4 text-ivory disabled:opacity-50">
            {copied ? "Copied" : "Copy client prices"}
          </button>
          <p className="text-xs text-ink-soft">Copies each window&apos;s price and the total for a text or email. Your costs are never copied.</p>
        </section>
      ) : null}
    </div>
  );
}
