"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TREATMENT_TYPES, type TreatmentType } from "@/lib/leads/treatment-types";
import {
  INSTALLABLE_TREATMENTS, priceFingerprint, priceQuote,
  type InstallRate, type InstallSettings, type LineInput, type PricedQuote,
} from "@/lib/admin/install-pricing";
import type { InstallQuoteKind, SavedInstallQuote } from "@/lib/admin/install-quotes";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatCents } from "@/lib/admin/money";
import { formatWhen } from "@/lib/admin/time";
import { installLinesSchema } from "@/lib/admin/schema";
import { saveInstallQuoteAction } from "./install-actions";

/** Only what filling from measurements reads, so callers and tests need not build whole rows. */
export type MeasuredWindow = Pick<
  WindowMeasurement,
  "id" | "room" | "label" | "widthEighths" | "heightEighths" | "requirements"
>;

const LABEL = new Map(TREATMENT_TYPES.map((type) => [type.key, type.label]));
const field = "min-h-11 border border-rule px-2";

/**
 * A line plus a stable React key. The width and height inputs are uncontrolled, so keying by
 * position would show one line's typed inches on another after a removal or a refill.
 */
type EditedLine = LineInput & { key: number };

const blankLine = (treatment: TreatmentType, key: number): EditedLine => ({
  key, treatment, count: 1, widthEighths: null, heightEighths: null,
  hardSurface: false, highLadder: false, motorized: false,
});

/** Inches typed by the owner, stored as eighths like every other dimension. */
const inchesToEighths = (value: string): number | null => {
  const inches = Number(value);
  return value.trim() === "" || !Number.isFinite(inches) || inches <= 0 ? null : Math.round(inches * 8);
};

/** How a dimension reads in its box: the eighths actually priced, or empty when there are none. */
const eighthsToInches = (eighths: number | null): string => (eighths === null ? "" : String(eighths / 8));

/**
 * When a dimension box loses focus, show the value that is priced, not the digits typed:
 * 30.1 is priced as 30 1/8, and text that is not a number is not priced at all.
 */
const showPriced = (input: HTMLInputElement) => {
  input.value = eighthsToInches(inchesToEighths(input.value));
};

/** The server refuses a save priced against rates that have since moved; this is how it says so. */
const RATES_CHANGED = "Rates changed since this page loaded.";

/**
 * Preview only. Pricing can fail — a treatment with no rate, a per-foot line with
 * no width — and that must read as a message, not crash the page. Lines the server
 * would refuse (a width under 1/8 inch, say) get the server's own message and no
 * price. The server prices again and saves only if it reaches this same price.
 */
function preview(lines: LineInput[], rates: InstallRate[], settings: InstallSettings, chargeMeasure: boolean):
  { priced: PricedQuote; error: null } | { priced: null; error: string } {
  const checked = installLinesSchema.safeParse(lines);
  if (!checked.success) return { priced: null, error: checked.error.issues[0].message };
  try {
    return { priced: priceQuote(lines, rates, settings, chargeMeasure), error: null };
  } catch (error) {
    return { priced: null, error: error instanceof Error ? error.message : "Could not price this job." };
  }
}

const FLAG_LABEL = { hardSurface: "Hard surface", highLadder: "High ladder", motorized: "Motorized" } as const;

export function InstallCalculator({ jobId, rates, settings, saved, measurements }: {
  jobId: string;
  rates: InstallRate[];
  settings: InstallSettings;
  saved: SavedInstallQuote[];
  measurements: MeasuredWindow[];
}) {
  const [lines, setLines] = useState<EditedLine[]>([]);
  const nextKey = useRef(0);
  const [fillTreatment, setFillTreatment] = useState<TreatmentType>(INSTALLABLE_TREATMENTS[0]);
  const [message, setMessage] = useState<string | null>(null);
  // Unticked until the owner chooses: a forgotten box must not bill a measure nobody meant to charge.
  const [chargeMeasure, setChargeMeasure] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (rates.length === 0) {
    return (
      <p role="alert" className="text-sm text-overdue">
        No installation rates are set. Add them in Settings before pricing a job.
      </p>
    );
  }

  const basisOf = new Map(rates.map((rate) => [rate.treatment, rate.basis]));
  const unkeyed = lines.map(({ key: _key, ...line }) => line);
  const { priced, error } = preview(unkeyed, rates, settings, chargeMeasure);

  const update = (key: number, patch: Partial<LineInput>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const remove = (key: number) => setLines((current) => current.filter((line) => line.key !== key));

  // A dimension the new basis does not use has no box on screen, so it must not travel with the save.
  const changeTreatment = (key: number, treatment: TreatmentType) => {
    const basis = basisOf.get(treatment);
    update(key, {
      treatment,
      ...(basis === "window" ? { widthEighths: null } : {}),
      ...(basis === "window" || basis === "linear_ft" ? { heightEighths: null } : {}),
    });
  };

  // One line per measured window. A line holds a single width and height, so
  // merging windows of different sizes would misprice anything sold by the foot.
  const fillFromMeasurements = () =>
    setLines(measurements.map((window) => ({
      key: nextKey.current++,
      treatment: fillTreatment,
      count: 1,
      widthEighths: window.widthEighths,
      heightEighths: window.heightEighths,
      hardSurface: window.requirements.includes("hard_surface"),
      highLadder: window.requirements.includes("high_ladder"),
      motorized: false,
    })));

  const save = (kind: InstallQuoteKind) => {
    if (!priced) return;
    // Everything this saved price would record, as the owner sees it now. The server saves
    // only if its own pricing produces the same fingerprint.
    const shown = priceFingerprint(priced, settings.minimumCents);
    startTransition(async () => {
      const result = await saveInstallQuoteAction(jobId, kind, unkeyed, chargeMeasure, shown);
      if (result.error) {
        setMessage(result.error);
        // Load the current rates so the preview shows the total a second save would store.
        if (result.error.startsWith(RATES_CHANGED)) router.refresh();
      } else {
        setMessage(null);
        setLines([]);
      }
    });
  };

  // Nothing to save until there is a line to install or a measuring visit to charge.
  const blocked = pending || (lines.length === 0 && !chargeMeasure) || error !== null;

  return (
    <div className="flex flex-col gap-6">
      {measurements.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Treatment for measured windows
            <select value={fillTreatment} onChange={(e) => setFillTreatment(e.target.value as TreatmentType)} className={field}>
              {INSTALLABLE_TREATMENTS.map((t) => <option key={t} value={t}>{LABEL.get(t)}</option>)}
            </select>
          </label>
          <button type="button" onClick={fillFromMeasurements} className={`${field} bg-ivory`}>
            Fill from measurements
          </button>
        </div>
      ) : null}

      <div aria-label="Lines" role="group" className="flex flex-col gap-3">
        {lines.map((line) => {
          const basis = basisOf.get(line.treatment);
          return (
            <div key={line.key} className="flex flex-wrap items-end gap-3 border border-rule p-3">
              <label className="flex flex-col gap-1 text-sm">
                Treatment
                <select value={line.treatment} onChange={(e) => changeTreatment(line.key, e.target.value as TreatmentType)} className={field}>
                  {INSTALLABLE_TREATMENTS.map((t) => <option key={t} value={t}>{LABEL.get(t)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Windows
                <input inputMode="numeric" value={String(line.count)}
                  onChange={(e) => update(line.key, { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  className={`${field} w-20`} />
              </label>
              {basis === "linear_ft" || basis === "sq_ft" ? (
                <label className="flex flex-col gap-1 text-sm">
                  Width (in)
                  <input inputMode="decimal"
                    defaultValue={eighthsToInches(line.widthEighths)}
                    onChange={(e) => update(line.key, { widthEighths: inchesToEighths(e.target.value) })}
                    onBlur={(e) => showPriced(e.currentTarget)}
                    className={`${field} w-24`} />
                </label>
              ) : null}
              {basis === "sq_ft" ? (
                <label className="flex flex-col gap-1 text-sm">
                  Height (in)
                  <input inputMode="decimal"
                    defaultValue={eighthsToInches(line.heightEighths)}
                    onChange={(e) => update(line.key, { heightEighths: inchesToEighths(e.target.value) })}
                    onBlur={(e) => showPriced(e.currentTarget)}
                    className={`${field} w-24`} />
                </label>
              ) : null}
              {(Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).map((flag) => (
                <label key={flag} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={line[flag]} onChange={(e) => update(line.key, { [flag]: e.target.checked })} />
                  {FLAG_LABEL[flag]}
                </label>
              ))}
              <button type="button" onClick={() => remove(line.key)}
                className="min-h-11 px-2 text-sm underline">
                Remove
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => setLines((current) => [...current, blankLine(rates[0].treatment, nextKey.current++)])}
        className={`${field} self-start bg-ivory`}>
        Add line
      </button>

      <label className="flex min-h-11 items-center gap-2 self-start text-sm">
        <input type="checkbox" checked={chargeMeasure} onChange={(e) => setChargeMeasure(e.target.checked)} />
        Charge for measuring
      </label>

      <div className="flex flex-col gap-1">
        {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}
        {priced && priced.minimumApplied ? (
          <p className="text-sm text-ink-soft">
            Lines come to {formatCents(priced.subtotalCents)}. Minimum job cost applied.
          </p>
        ) : null}
        {priced && priced.measureCents > 0 ? (
          <p className="text-sm text-ink-soft">
            Measurement <span data-testid="install-measure">{formatCents(priced.measureCents)}</span>
          </p>
        ) : null}
        <p className="text-lg font-semibold">
          Total <span data-testid="install-total">{formatCents(priced ? priced.totalCents : 0)}</span>
        </p>
      </div>

      {message ? <p role="alert" className="text-sm text-overdue">{message}</p> : null}
      <div className="flex gap-3">
        <button type="button" disabled={blocked} onClick={() => save("estimate")}
          className="min-h-11 bg-charcoal px-4 text-sm text-ivory">
          Save as estimate
        </button>
        <button type="button" disabled={blocked} onClick={() => save("final")}
          className="min-h-11 border border-charcoal px-4 text-sm">
          Save as final
        </button>
      </div>

      {saved.length > 0 ? (
        <section aria-labelledby="install-history" className="flex flex-col gap-2">
          <h3 id="install-history" className="text-sm font-semibold">Saved prices</h3>
          <ul className="flex flex-col divide-y divide-rule border border-rule">
            {saved.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-semibold">{quote.kind === "estimate" ? "Estimate" : "Final"}</span>
                <span>{formatCents(quote.totalCents)}</span>
                <span className="text-ink-soft">{quote.createdBy} · {formatWhen(quote.createdAt)}</span>
                {/* The measuring fee also lifts the total above the lines, so compare without it. */}
                {quote.subtotalCents < quote.totalCents - quote.measureCents ? (
                  <span className="w-full text-ink-soft">
                    Minimum applied (lines came to {formatCents(quote.subtotalCents)})
                  </span>
                ) : null}
                {quote.measureCents > 0 ? (
                  <span className="w-full text-ink-soft">Includes {formatCents(quote.measureCents)} measurement</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
