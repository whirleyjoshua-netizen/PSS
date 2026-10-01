import Link from "next/link";
import { MEASURE_KIND_LABEL, windowsOfKind, type MeasureSet } from "@/lib/admin/measure-kinds";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { windowCount } from "@/lib/admin/measure-units";

const CHOICE = "flex min-h-20 flex-col justify-center gap-1 border border-rule bg-ivory px-5 py-4";
const windows = (n: number) => `${n} ${n === 1 ? "window" : "windows"}`;

/** The first screen of the Measure app: which measure is this? */
export function MeasureChooser({ jobId, set }: { jobId: string; set: MeasureSet<WindowMeasurement> }) {
  const href = (kind: string) => `/admin/jobs/${jobId}/measure?kind=${kind}`;
  return (
    <div className="flex flex-col gap-3">
      <Link href={href("designer")} className={CHOICE}>
        <span className="text-lg font-semibold">{MEASURE_KIND_LABEL.designer}</span>
        <span className="text-sm text-ink-soft">{windows(windowCount(windowsOfKind(set, "designer")))}</span>
      </Link>
      {set.kept ? (
        <div className={`${CHOICE} text-ink-soft`}>
          <span className="text-lg font-semibold">{MEASURE_KIND_LABEL.official}</span>
          <span className="text-sm">Using designer measure — untick “Keep as official measure” to measure separately.</span>
        </div>
      ) : (
        <Link href={href("official")} className={CHOICE}>
          <span className="text-lg font-semibold">{MEASURE_KIND_LABEL.official}</span>
          <span className="text-sm text-ink-soft">{windows(windowCount(windowsOfKind(set, "official")))}</span>
        </Link>
      )}
    </div>
  );
}
