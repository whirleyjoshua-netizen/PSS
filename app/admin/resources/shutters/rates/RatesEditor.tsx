"use client";

import { useActionState, useState } from "react";
import {
  OPTION_KINDS, OPTION_KIND_LABEL, SUPPLIERS, parseInches, parseMarkup, parseOptionRows, supplierLabel,
  type OptionKind, type RatesInput, type ShutterRates, type Supplier,
} from "@/lib/admin/shutter-pricing";
import { plainInches as formatInchesPlain } from "@/lib/admin/shutter-quote-lines";
import { saveShutterRatesAction, type ShutterRatesState } from "../actions";

type LineRow = { key: number; supplier: Supplier; name: string; cost: string; minSqft: string; client: string; frame: string };
type OptionRow = { key: number; supplier: Supplier; name: string; kind: OptionKind; amount: string };
type FreightRow = { first: string; additional: string; oversizeWidth: string; oversizeFirst: string; oversizeAdditional: string; perSqft: string; minSqft: string };

const field = "min-h-11 border border-rule bg-white px-2 text-sm";
let nextKey = 1;
/** Cents (or basis points) to the box: 1234 → "12.34", 1000 → "10". Both are hundredths. */
const hundredths = (n: number) => (n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2));
const blankText = (n: number) => (n === 0 ? "" : hundredths(n));

/** "12.34" → 1234. Blank counts as 0 where 0 is allowed. */
function toHundredths(text: string, label: string, errors: string[]): number {
  const cleaned = text.replace(/[$,%\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) { errors.push(`${label}: "${text}" is not an amount`); return 0; }
  return Math.round(Number(cleaned) * 100);
}
function toWhole(text: string, label: string, errors: string[]): number {
  const cleaned = text.trim();
  if (cleaned === "") return 0;
  if (!/^\d+$/.test(cleaned)) { errors.push(`${label}: "${text}" is not a whole number`); return 0; }
  return Number(cleaned);
}
/** "4", "3 1/2" or "3.5" inches → eighths. Blank or 0 is no frame. */
function toFrame(text: string, label: string, errors: string[]): number {
  const cleaned = text.trim();
  if (cleaned === "" || /^0+(\.0*)?$/.test(cleaned)) return 0;
  const eighths = parseInches(cleaned);
  if (eighths === null) { errors.push(`${label}: "${text}" is not a size in inches`); return 0; }
  if (eighths > 96) { errors.push(`${label}: a frame adds at most 12 inches`); return 0; }
  return eighths;
}

export function RatesEditor({ rates }: { rates: ShutterRates }) {
  const [state, action, pending] = useActionState<ShutterRatesState, FormData>(saveShutterRatesAction, {});
  const [lines, setLines] = useState<LineRow[]>(() => rates.lines.map((l) => ({
    key: nextKey++, supplier: l.supplier, name: l.name, cost: hundredths(l.costCentsPerSqft), minSqft: l.minSqft ? String(l.minSqft) : "",
    client: l.clientCentsPerSqft === null ? "" : hundredths(l.clientCentsPerSqft),
    frame: l.frameAddEighths ? formatInchesPlain(l.frameAddEighths) : "",
  })));
  const [options, setOptions] = useState<OptionRow[]>(() => rates.options.map((o) => ({
    key: nextKey++, supplier: o.supplier, name: o.name, kind: o.kind, amount: hundredths(o.amount),
  })));
  const [freight, setFreight] = useState<Record<Supplier, FreightRow>>(() => Object.fromEntries(SUPPLIERS.map((s) => {
    const f = rates.freight.find((x) => x.supplier === s);
    return [s, {
      first: blankText(f?.firstCents ?? 0), additional: blankText(f?.additionalCents ?? 0),
      oversizeWidth: f?.oversizeWidthEighths ? String(f.oversizeWidthEighths / 8) : "",
      oversizeFirst: blankText(f?.oversizeFirstCents ?? 0), oversizeAdditional: blankText(f?.oversizeAdditionalCents ?? 0),
      perSqft: blankText(f?.perSqftCents ?? 0), minSqft: f?.minSqft ? String(f.minSqft) : "",
    }];
  })) as Record<Supplier, FreightRow>);
  const [markup, setMarkup] = useState(rates.markupHundredths === null ? "" : hundredths(rates.markupHundredths));
  const [install, setInstall] = useState(rates.installCentsPerSqft === null ? "" : hundredths(rates.installCentsPerSqft));
  const [paste, setPaste] = useState<Record<Supplier, string>>({ norman: "", onyx: "" });
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);

  // Build what will be saved, collecting every unreadable box so Save can name them all.
  const errors: string[] = [];
  let markupHundredths: number | null = null;
  try { markupHundredths = parseMarkup(markup); } catch (e) { errors.push(`Markup: ${(e as Error).message}`); }
  const payload: RatesInput = {
    lines: lines.map((l, i) => ({
      supplier: l.supplier, name: l.name.trim(),
      costCentsPerSqft: toHundredths(l.cost, `${supplierLabel(l.supplier)} line ${l.name || i + 1}`, errors),
      minSqft: toWhole(l.minSqft, `${supplierLabel(l.supplier)} line ${l.name || i + 1} minimum`, errors),
      // Blank keeps the markup for this line.
      clientCentsPerSqft: l.client.trim() === "" ? null : toHundredths(l.client, `${supplierLabel(l.supplier)} line ${l.name || i + 1} client price`, errors),
      frameAddEighths: toFrame(l.frame, `${supplierLabel(l.supplier)} line ${l.name || i + 1} frame`, errors),
    })),
    options: options.map((o, i) => ({
      supplier: o.supplier, name: o.name.trim(), kind: o.kind,
      amount: toHundredths(o.amount, `${supplierLabel(o.supplier)} add-on ${o.name || i + 1}`, errors),
    })),
    freight: SUPPLIERS.map((s) => {
      const f = freight[s];
      const label = `${supplierLabel(s)} freight`;
      const width = f.oversizeWidth.trim() === "" ? 0 : Number(f.oversizeWidth);
      if (!Number.isFinite(width) || width < 0) errors.push(`${label}: oversize width "${f.oversizeWidth}" is not a size`);
      return {
        supplier: s,
        firstCents: toHundredths(f.first, label, errors),
        additionalCents: toHundredths(f.additional, label, errors),
        oversizeWidthEighths: Number.isFinite(width) ? Math.round(width * 8) : 0,
        oversizeFirstCents: toHundredths(f.oversizeFirst, label, errors),
        oversizeAdditionalCents: toHundredths(f.oversizeAdditional, label, errors),
        perSqftCents: toHundredths(f.perSqft, label, errors),
        minSqft: toWhole(f.minSqft, `${label} minimum sq ft`, errors),
      };
    }),
    markupHundredths,
    // Blank is "not set" (prices leave install out); 0 would claim install is free.
    installCentsPerSqft: install.trim() === "" ? null : toHundredths(install, "Installation per sq ft", errors),
  };

  const setLine = (key: number, patch: Partial<LineRow>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setOption = (key: number, patch: Partial<OptionRow>) => setOptions((all) => all.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const setFreightField = (s: Supplier, patch: Partial<FreightRow>) => setFreight((all) => ({ ...all, [s]: { ...all[s], ...patch } }));

  const addPasted = (s: Supplier) => {
    const { rows, errors: bad } = parseOptionRows(paste[s], s);
    setPasteErrors(bad);
    if (bad.length > 0) return;
    setOptions((all) => [...all, ...rows.map((r) => ({ key: nextKey++, supplier: s, name: r.name, kind: r.kind, amount: hundredths(r.amount) }))]);
    setPaste((p) => ({ ...p, [s]: "" }));
  };

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="rates" value={JSON.stringify(payload)} />

      <div className="flex flex-col gap-1 text-sm sm:max-w-xs">
        <label htmlFor="markup" className="font-semibold">Markup (× cost)</label>
        <input id="markup" aria-describedby="markup-hint" value={markup} onChange={(e) => setMarkup(e.target.value)} inputMode="decimal" placeholder="Not set" className={field} />
        <p id="markup-hint" className="text-xs text-ink-soft">Client price = (product + freight) × markup, plus installation. Blank shows cost only.</p>
      </div>

      <div className="flex flex-col gap-1 text-sm sm:max-w-xs">
        <label htmlFor="install" className="font-semibold">Installation ($ per sq ft)</label>
        <input id="install" aria-describedby="install-hint" value={install} onChange={(e) => setInstall(e.target.value)} inputMode="decimal" placeholder="Not set" className={field} />
        <p id="install-hint" className="text-xs text-ink-soft">For this guide only, never marked up, and rounded up to whole sq ft per shutter. Install-only jobs use Settings → Installation rates.</p>
      </div>

      {SUPPLIERS.map((s) => {
        const name = supplierLabel(s);
        const f = freight[s];
        return (
          <section key={s} aria-labelledby={`${s}-heading`} className="flex flex-col gap-5 border border-rule bg-ivory p-4">
            <h2 id={`${s}-heading`} className="text-lg font-semibold">{name}</h2>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold">Lines, cost per sq ft</legend>
              <p className="text-xs text-ink-soft">Client $ / sq ft is that line&apos;s price installed and shipped. It replaces the markup for the line. Leave it blank to use the markup. Frame adds is how much the frame adds to the window&apos;s width and to its height (Norman&apos;s 2&quot; deco frame adds 4). Enter window sizes in the guide: it prices the framed size and the quote shows the window size.</p>
              {lines.filter((l) => l.supplier === s).map((l) => (
                <div key={l.key} className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs">Line
                    <input value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} className={`${field} w-56`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">$ / sq ft
                    <input value={l.cost} inputMode="decimal" onChange={(e) => setLine(l.key, { cost: e.target.value })} className={`${field} w-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">Client $ / sq ft
                    <input value={l.client} inputMode="decimal" placeholder="Markup" onChange={(e) => setLine(l.key, { client: e.target.value })} className={`${field} w-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">Frame adds (in)
                    <input value={l.frame} inputMode="decimal" placeholder="0" onChange={(e) => setLine(l.key, { frame: e.target.value })} className={`${field} w-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">Minimum sq ft
                    <input value={l.minSqft} inputMode="numeric" placeholder="None" onChange={(e) => setLine(l.key, { minSqft: e.target.value })} className={`${field} w-24`} />
                  </label>
                  <button type="button" onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))} className="min-h-11 text-xs underline underline-offset-4">
                    Remove {l.name || "line"}
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setLines((all) => [...all, { key: nextKey++, supplier: s, name: "", cost: "", minSqft: "", client: "", frame: "" }])}
                className="min-h-11 self-start border border-charcoal px-3 text-sm">Add a {name} line</button>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold">Add-ons</legend>
              <p className="text-xs text-ink-soft">Amount is dollars, or a percent of the base price when the kind is %. Percents each come off the base; they do not stack.</p>
              {options.filter((o) => o.supplier === s).map((o) => (
                <div key={o.key} className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs">Add-on
                    <input value={o.name} onChange={(e) => setOption(o.key, { name: e.target.value })} className={`${field} w-72`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">Charged
                    <select value={o.kind} onChange={(e) => setOption(o.key, { kind: e.target.value as OptionKind })} className={`${field} w-32`}>
                      {OPTION_KINDS.map((k) => <option key={k} value={k}>{OPTION_KIND_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">{o.kind === "percent" ? "%" : "$"}
                    <input value={o.amount} inputMode="decimal" onChange={(e) => setOption(o.key, { amount: e.target.value })} className={`${field} w-24`} />
                  </label>
                  <button type="button" onClick={() => setOptions((all) => all.filter((x) => x.key !== o.key))} className="min-h-11 text-xs underline underline-offset-4">
                    Remove {o.name || "add-on"}
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setOptions((all) => [...all, { key: nextKey++, supplier: s, name: "", kind: "per_window", amount: "" }])}
                className="min-h-11 self-start border border-charcoal px-3 text-sm">Add a {name} add-on</button>
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm">Paste a list of {name} add-ons</summary>
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-xs">One per line: name | kind | amount. Kinds: %, window, panel, sqft, ft, each, order.
                    <textarea value={paste[s]} onChange={(e) => setPaste((p) => ({ ...p, [s]: e.target.value }))} rows={6} className="border border-rule bg-white p-2 font-mono text-xs" placeholder={"Premium color | % | 10\nAngle top | window | 215"} />
                  </label>
                  <button type="button" onClick={() => addPasted(s)} className="min-h-11 self-start border border-charcoal px-3 text-sm">Add these rows</button>
                </div>
              </details>
            </fieldset>

            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">Freight</legend>
              <label className="flex items-center justify-between gap-2 text-sm">First shutter ($)
                <input value={f.first} inputMode="decimal" onChange={(e) => setFreightField(s, { first: e.target.value })} className={`${field} w-24`} /></label>
              <label className="flex items-center justify-between gap-2 text-sm">Each additional ($)
                <input value={f.additional} inputMode="decimal" onChange={(e) => setFreightField(s, { additional: e.target.value })} className={`${field} w-24`} /></label>
              <label className="flex items-center justify-between gap-2 text-sm">Oversize from width (in)
                <input value={f.oversizeWidth} inputMode="decimal" onChange={(e) => setFreightField(s, { oversizeWidth: e.target.value })} className={`${field} w-24`} /></label>
              <label className="flex items-center justify-between gap-2 text-sm">Oversize first ($)
                <input value={f.oversizeFirst} inputMode="decimal" onChange={(e) => setFreightField(s, { oversizeFirst: e.target.value })} className={`${field} w-24`} /></label>
              <label className="flex items-center justify-between gap-2 text-sm">Oversize each additional ($)
                <input value={f.oversizeAdditional} inputMode="decimal" onChange={(e) => setFreightField(s, { oversizeAdditional: e.target.value })} className={`${field} w-24`} /></label>
              <label className="flex items-center justify-between gap-2 text-sm">Per sq ft ($)
                <input value={f.perSqft} inputMode="decimal" onChange={(e) => setFreightField(s, { perSqft: e.target.value })} className={`${field} w-24`} /></label>
              <label className="flex items-center justify-between gap-2 text-sm">Minimum sq ft per shipment
                <input value={f.minSqft} inputMode="numeric" onChange={(e) => setFreightField(s, { minSqft: e.target.value })} className={`${field} w-24`} /></label>
            </fieldset>
          </section>
        );
      })}

      {pasteErrors.length > 0 ? (
        <ul role="alert" className="text-sm text-overdue">{pasteErrors.map((e) => <li key={e}>{e}</li>)}</ul>
      ) : null}
      {errors.length > 0 ? (
        <div role="alert"><ul aria-label="Fix before saving" className="text-sm text-overdue">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
      ) : null}
      {state.error ? <p role="alert" className="text-sm text-overdue">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm">Saved.</p> : null}
      <button type="submit" disabled={pending || errors.length > 0} className="min-h-11 self-start bg-charcoal px-4 text-sm text-ivory disabled:opacity-50">
        {pending ? "Saving…" : "Save rates"}
      </button>
    </form>
  );
}
