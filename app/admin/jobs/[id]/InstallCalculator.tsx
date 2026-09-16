"use client";

import { useRef, useState, useTransition } from "react";
import { TREATMENT_TYPES, type TreatmentType } from "@/lib/leads/treatment-types";
import {
  INSTALLABLE_TREATMENTS, priceQuote,
  type InstallRate, type InstallSettings, type LineInput, type PricedQuote,
} from "@/lib/admin/install-pricing";
import type { InstallQuoteKind, SavedInstallQuote } from "@/lib/admin/install-quotes";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatCents } from "@/lib/admin/money";
import { formatWhen } from "@/lib/admin/time";
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

/**
 * Preview only. Pricing can fail — a treatment with no rate, a per-foot line with
 * no width — and that must read as a message, not crash the page. The saved price
 * is computed again on the server from the stored rates.
 */
function preview(lines: LineInput[], rates: InstallRate[], settings: InstallSettings):
  { priced: PricedQuote; error: null } | { priced: null; error: string } {
  try {
    return { priced: priceQuote(lines, rates, settings), error: null };
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
  const [pending, startTransition] = useTransition();

  if (rates.length === 0) {
    return (
      <p role="alert" className="text-sm text-overdue">
        No installation rates are set. Add them in Settings before pricing a job.
      </p>
    );
  }

  const basisOf = new Map(rates.map((rate) => [rate.treatment, rate.basis]));
  const { priced, error } = preview(lines, rates, settings);

  const update = (index: number, patch: Partial<LineInput>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

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

  const save = (kind: InstallQuoteKind) =>
    startTransition(async () => {
      const result = await saveInstallQuoteAction(jobId, kind, lines.map(({ key: _key, ...line }) => line));
      if (result.error) {
        setMessage(result.error);
      } else {
        setMessage(null);
        setLines([]);
      }
    });

  const blocked = pending || lines.length === 0 || error !== null;

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
        {lines.map((line, index) => {
          const basis = basisOf.get(line.treatment);
          return (
            <div key={line.key} className="flex flex-wrap items-end gap-3 border border-rule p-3">
              <label className="flex flex-col gap-1 text-sm">
                Treatment
                <select value={line.treatment} onChange={(e) => update(index, { treatment: e.target.value as TreatmentType })} className={field}>
                  {INSTALLABLE_TREATMENTS.map((t) => <option key={t} value={t}>{LABEL.get(t)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Windows
                <input inputMode="numeric" value={String(line.count)}
                  onChange={(e) => update(index, { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  className={`${field} w-20`} />
              </label>
              {basis === "linear_ft" || basis === "sq_ft" ? (
                <label className="flex flex-col gap-1 text-sm">
                  Width (in)
                  <input inputMode="decimal"
                    defaultValue={line.widthEighths === null ? "" : String(line.widthEighths / 8)}
                    onChange={(e) => update(index, { widthEighths: inchesToEighths(e.target.value) })}
                    className={`${field} w-24`} />
                </label>
              ) : null}
              {basis === "sq_ft" ? (
                <label className="flex flex-col gap-1 text-sm">
                  Height (in)
                  <input inputMode="decimal"
                    defaultValue={line.heightEighths === null ? "" : String(line.heightEighths / 8)}
                    onChange={(e) => update(index, { heightEighths: inchesToEighths(e.target.value) })}
                    className={`${field} w-24`} />
                </label>
              ) : null}
              {(Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).map((flag) => (
                <label key={flag} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={line[flag]} onChange={(e) => update(index, { [flag]: e.target.checked })} />
                  {FLAG_LABEL[flag]}
                </label>
              ))}
              <button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
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

      <div className="flex flex-col gap-1">
        {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}
        {priced && priced.minimumApplied ? (
          <p className="text-sm text-ink-soft">
            Lines come to {formatCents(priced.subtotalCents)}. Minimum job cost applied.
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
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
