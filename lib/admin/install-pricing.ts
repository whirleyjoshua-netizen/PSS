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
  /** A flat fee for an installer's measuring visit, whatever the number of windows. */
  measureCents: number;
  /** Per window of blinds or drapery taken down. */
  takedownCents: number;
  /** Per whole square foot of shutters taken down. */
  shutterTakedownCents: number;
  /** Flat app set-up for 1–3 motors. */
  appSetupSmallCents: number;
  /** Flat app set-up for 4–9 motors. 10 or more is priced by hand on the job. */
  appSetupLargeCents: number;
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

export const EXTRA_KINDS = ["takedown", "shutter_takedown", "app_setup_small", "app_setup_large", "app_setup_custom"] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];

/**
 * The extras the owner asks for on a job. App set-up is not asked for: it follows from the
 * motorized lines. `customSetupCents` is the price typed for 10 or more motors, and is
 * ignored below that.
 */
export type ExtrasInput = { takedownWindows: number; shutterTakedownSqFt: number; customSetupCents: number | null };
export const NO_EXTRAS: ExtrasInput = { takedownWindows: 0, shutterTakedownSqFt: 0, customSetupCents: null };

/** From this many motors the set-up is quoted by hand; the sheet has no flat price for it. */
export const CUSTOM_SETUP_MOTORS = 10;

export type PricedExtra = { kind: ExtraKind; quantity: number; rateCents: number; amountCents: number };

/** One motor per motorized shade. */
export const motorCount = (lines: LineInput[]): number =>
  lines.reduce((sum, line) => sum + (line.motorized ? line.count : 0), 0);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function extraLabel(extra: Pick<PricedExtra, "kind" | "quantity">): string {
  if (extra.kind === "takedown") return `Takedown, ${plural(extra.quantity, "window", "windows")}`;
  if (extra.kind === "shutter_takedown") return `Shutter takedown, ${extra.quantity} sq ft`;
  return `App set-up, ${plural(extra.quantity, "motor", "motors")}`;
}

export type PricedLine = LineInput & {
  basis: Basis;
  rateCents: number;
  quantity: number;
  amountCents: number;
};

export type PricedQuote = {
  lines: PricedLine[];
  subtotalCents: number;
  /** Each extra charged, in order. Counts toward the minimum like the lines. */
  extras: PricedExtra[];
  extrasCents: number;
  /** The measuring fee charged: the flat fee when charged, otherwise 0. */
  measureCents: number;
  /** The work (raised to the minimum when it applies) plus the measuring fee. */
  totalCents: number;
  minimumApplied: boolean;
};

/** The largest value a Postgres integer column holds; every stored amount must fit. */
const MAX_CENTS = 2_147_483_647;
const TOO_LARGE = "This job is too large to price.";

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

const notSet = (name: string) => new Error(`No rate is set for ${name}`);

/** Rows only for extras actually charged, in a fixed order: takedown, shutter takedown, set-up. */
function priceExtras(lines: LineInput[], settings: InstallSettings, extras: ExtrasInput): PricedExtra[] {
  const priced: PricedExtra[] = [];
  const perUnit = (kind: ExtraKind, quantity: number, rateCents: number, name: string) => {
    if (quantity <= 0) return;
    // A missing rate must be loud, as with treatments: zero would quietly give the work away.
    if (rateCents <= 0) throw notSet(name);
    priced.push({ kind, quantity, rateCents, amountCents: rateCents * quantity });
  };
  perUnit("takedown", extras.takedownWindows, settings.takedownCents, "blinds/drapery takedown");
  perUnit("shutter_takedown", extras.shutterTakedownSqFt, settings.shutterTakedownCents, "shutter takedown");

  const motors = motorCount(lines);
  if (motors === 0) return priced;
  if (motors >= CUSTOM_SETUP_MOTORS) {
    if (extras.customSetupCents === null) throw new Error("10 or more motors: enter the app set-up price");
    priced.push({ kind: "app_setup_custom", quantity: motors, rateCents: extras.customSetupCents, amountCents: extras.customSetupCents });
    return priced;
  }
  const small = motors <= 3;
  const rateCents = small ? settings.appSetupSmallCents : settings.appSetupLargeCents;
  if (rateCents <= 0) throw notSet(small ? "app set-up, 1–3 motors" : "app set-up, 4–9 motors");
  priced.push({ kind: small ? "app_setup_small" : "app_setup_large", quantity: motors, rateCents, amountCents: rateCents });
  return priced;
}

/**
 * `chargeMeasure` is required, never defaulted: whether an installer's measuring visit is billed
 * is a decision made per job, and a silent default would drop or add a fee without anyone choosing.
 * `extras` is required, never defaulted, for the same reason: takedown and a typed set-up price are
 * chosen per job, and a default would quietly leave them off. Pass `NO_EXTRAS` to choose none.
 */
export function priceQuote(
  lines: LineInput[],
  rates: InstallRate[],
  settings: InstallSettings,
  extras: ExtrasInput,
  chargeMeasure: boolean,
): PricedQuote {
  const byTreatment = new Map(rates.map((r) => [r.treatment, r]));
  const priced = lines.map((line): PricedLine => {
    const rate = byTreatment.get(line.treatment);
    // A missing rate must be loud. Pricing it at zero would quietly under-quote a job.
    if (!rate) throw new Error(`No installation rate is set for ${LABEL.get(line.treatment) ?? line.treatment}`);
    const quantity = quantityFor(rate.basis, line);
    const amountCents = rate.rateCents * quantity + line.count * surchargeFor(line, settings);
    if (amountCents > MAX_CENTS) throw new Error(TOO_LARGE);
    return { ...line, basis: rate.basis, rateCents: rate.rateCents, quantity, amountCents };
  });
  const subtotalCents = priced.reduce((sum, l) => sum + l.amountCents, 0);
  if (subtotalCents > MAX_CENTS) throw new Error(TOO_LARGE);
  const pricedExtras = priceExtras(lines, settings, extras);
  if (pricedExtras.some((extra) => extra.amountCents > MAX_CENTS)) throw new Error(TOO_LARGE);
  const extrasCents = pricedExtras.reduce((sum, extra) => sum + extra.amountCents, 0);
  if (extrasCents > MAX_CENTS) throw new Error(TOO_LARGE);
  // Takedown and set-up happen on the install trip, so they count toward the minimum.
  const workCents = subtotalCents + extrasCents;
  if (workCents > MAX_CENTS) throw new Error(TOO_LARGE);
  // A job with nothing to install and nothing to take down is not a job — no lines, or only
  // lines with a count of 0, and no extras — so the minimum should not invent a charge out of nothing.
  const hasWork = priced.some((l) => l.quantity > 0) || pricedExtras.length > 0;
  const minimumApplied = hasWork && workCents < settings.minimumCents;
  // The minimum covers the install trip; measuring is its own trip, so its fee goes on top.
  const measureCents = chargeMeasure ? settings.measureCents : 0;
  const totalCents = (minimumApplied ? settings.minimumCents : workCents) + measureCents;
  if (totalCents > MAX_CENTS) throw new Error(TOO_LARGE);
  return { lines: priced, subtotalCents, extras: pricedExtras, extrasCents, measureCents, totalCents, minimumApplied };
}

/**
 * Everything a saved price records, as one comparable string: the minimum in force, the
 * subtotal, the extras' total, the measuring fee and total, each line's stored columns in order,
 * and each extra's kind, quantity, rate and amount in order. A saved price is immutable,
 * so the server saves only when its own fingerprint equals the one the owner was looking
 * at. Comparing the total alone is not enough — rates can move between lines, or the
 * minimum can hide a changed subtotal, while the total stays the same.
 */
export function priceFingerprint(priced: PricedQuote, minimumCents: number): string {
  return JSON.stringify({
    minimumCents,
    subtotalCents: priced.subtotalCents,
    extrasCents: priced.extrasCents,
    measureCents: priced.measureCents,
    totalCents: priced.totalCents,
    lines: priced.lines.map((l) => [
      l.treatment, l.basis, l.quantity, l.rateCents, l.hardSurface, l.highLadder, l.motorized, l.amountCents,
    ]),
    extras: priced.extras.map((e) => [e.kind, e.quantity, e.rateCents, e.amountCents]),
  });
}
