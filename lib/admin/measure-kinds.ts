/**
 * Designer measure vs Official measure. The database enforces the same pair with
 * window_measurements_kind_check (031). No "server-only": the job page, the measure screens and
 * their tests all read these rules.
 */
export const MEASURE_KINDS = ["designer", "official"] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];

export const isMeasureKind = (value: unknown): value is MeasureKind =>
  typeof value === "string" && (MEASURE_KINDS as readonly string[]).includes(value);

export const MEASURE_KIND_LABEL: Record<MeasureKind, string> = {
  designer: "Designer measure",
  official: "Official measure",
};

/** Set when the designer measure IS the job's official measure: who said so, and when. */
export type KeptOfficial = { at: Date; by: string } | null;

/** Every window of a job, both kinds, with the job's keep-as-official record. */
export type MeasureSet<W extends { kind: MeasureKind }> = { windows: W[]; kept: KeptOfficial };

export const windowsOfKind = <W extends { kind: MeasureKind }>(set: MeasureSet<W>, kind: MeasureKind): W[] =>
  set.windows.filter((window) => window.kind === kind);

/** The numbers to order from: the designer's when kept as official, else the official measure's. */
export const officialWindows = <W extends { kind: MeasureKind }>(set: MeasureSet<W>): W[] =>
  windowsOfKind(set, set.kept ? "designer" : "official");

/** What pricing, counts and the customer's window picker use: official if there is one, else designer. */
export function workingWindows<W extends { kind: MeasureKind }>(set: MeasureSet<W>): W[] {
  const official = officialWindows(set);
  return official.length ? official : windowsOfKind(set, "designer");
}

/** Which list workingWindows came from, or null when nothing is measured. */
export function workingSource<W extends { kind: MeasureKind }>(set: MeasureSet<W>): MeasureKind | null {
  if (officialWindows(set).length) return "official";
  return windowsOfKind(set, "designer").length ? "designer" : null;
}
