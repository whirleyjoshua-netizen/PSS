/**
 * Every rule about what an installation costs. Pure: no database, no clock, no
 * request. Rates and lines in, cents out — so the money rules can be tested
 * exhaustively without a database, and a caller cannot accidentally price a job
 * against rates that have moved since.
 */
import { TREATMENT_TYPES, type TreatmentType } from "@/lib/leads/treatment-types";

export const INSTALL_BASES = ["window", "linear_ft", "sq_ft"] as const;
export type Basis = (typeof INSTALL_BASES)[number];

/** `not_sure` is a questionnaire answer, not something anyone installs. */
export const INSTALLABLE_TREATMENTS = TREATMENT_TYPES
  .filter((type) => type.key !== "not_sure")
  .map((type) => type.key) as readonly TreatmentType[];

const LABEL = new Map(TREATMENT_TYPES.map((type) => [type.key, type.label]));

export const basisLabel = (basis: Basis): string =>
  basis === "window" ? "Per window" : basis === "linear_ft" ? "Per foot" : "Per square foot";

export type InstallRate = { treatment: TreatmentType; basis: Basis; rateCents: number };

export type InstallSettings = {
  minimumCents: number;
  hardSurfaceCents: number;
  highLadderCents: number;
  motorizedCents: number;
};

export type LineInput = {
  treatment: TreatmentType;
  count: number;
  /** Whole eighths of an inch, as measurements are stored. Needed by the foot. */
  widthEighths: number | null;
  heightEighths: number | null;
  hardSurface: boolean;
  highLadder: boolean;
  motorized: boolean;
};

export type PricedLine = LineInput & {
  basis: Basis;
  rateCents: number;
  quantity: number;
  amountCents: number;
};

export type PricedQuote = {
  lines: PricedLine[];
  subtotalCents: number;
  totalCents: number;
  minimumApplied: boolean;
};

const EIGHTHS_PER_FOOT = 96; // 12 inches
const SQ_EIGHTHS_PER_SQ_FOOT = 9216; // 144 sq in, in eighths squared

/**
 * Windows, whole feet, or whole square feet. Rounding is per window and always
 * up, then multiplied by the count: three windows at 8.33 sq ft bill as 27, not 25.
 */
export function quantityFor(basis: Basis, line: LineInput): number {
  if (basis === "window") return line.count;
  if (line.widthEighths === null) {
    throw new Error(
      basis === "linear_ft"
        ? "Width is needed to price by the foot"
        : "Width and height are needed to price by the square foot",
    );
  }
  if (basis === "linear_ft") return Math.ceil(line.widthEighths / EIGHTHS_PER_FOOT) * line.count;
  if (line.heightEighths === null) throw new Error("Width and height are needed to price by the square foot");
  const area = Math.ceil((line.widthEighths * line.heightEighths) / SQ_EIGHTHS_PER_SQ_FOOT);
  return area * line.count;
}

const surchargeFor = (line: LineInput, settings: InstallSettings): number =>
  (line.hardSurface ? settings.hardSurfaceCents : 0) +
  (line.highLadder ? settings.highLadderCents : 0) +
  (line.motorized ? settings.motorizedCents : 0);

export function priceQuote(
  lines: LineInput[],
  rates: InstallRate[],
  settings: InstallSettings,
): PricedQuote {
  const byTreatment = new Map(rates.map((r) => [r.treatment, r]));
  const priced = lines.map((line): PricedLine => {
    const rate = byTreatment.get(line.treatment);
    // A missing rate must be loud. Pricing it at zero would quietly under-quote a job.
    if (!rate) throw new Error(`No installation rate is set for ${LABEL.get(line.treatment) ?? line.treatment}`);
    const quantity = quantityFor(rate.basis, line);
    const amountCents = rate.rateCents * quantity + line.count * surchargeFor(line, settings);
    return { ...line, basis: rate.basis, rateCents: rate.rateCents, quantity, amountCents };
  });
  const subtotalCents = priced.reduce((sum, l) => sum + l.amountCents, 0);
  // An empty job is not a job; the minimum should not invent a charge out of nothing.
  const minimumApplied = priced.length > 0 && subtotalCents < settings.minimumCents;
  return {
    lines: priced,
    subtotalCents,
    totalCents: minimumApplied ? settings.minimumCents : subtotalCents,
    minimumApplied,
  };
}
