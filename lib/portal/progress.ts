import { STAGES, type Stage } from "@/lib/admin/stages";
import { formatDateOnly, formatMonthDay, lasVegasDate } from "@/lib/admin/time";

/** The stages a customer can see, in order. Earlier stages and Lost are never shown. */
export const PORTAL_STAGES = ["quoted", "sold", "ordered", "installed"] as const;
export type PortalStage = (typeof PORTAL_STAGES)[number];

/** The statuses whose jobs a customer may see. Completed shows as the Installed step. */
export const PORTAL_STATUSES = [...PORTAL_STAGES, "completed"] as const;

export const isPortalStatus = (status: Stage): boolean =>
  (PORTAL_STATUSES as readonly string[]).includes(status);

/** Only call with a portal status. Customers never see the word Completed. */
export const toPortalStage = (status: Stage): PortalStage =>
  status === "completed" ? "installed" : (status as PortalStage);

/** The customer's seven steps, in order. The keys are stable; the labels are what they read. */
export const STEP_KEYS = [
  "consultation", "measurements", "quote", "order", "production", "ready", "installed",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export type ProjectStep = {
  key: StepKey;
  label: string;
  state: "done" | "current" | "upcoming";
  /** A Las Vegas day such as "Sep 13", or null when the step has no date. */
  on: string | null;
  /**
   * True when `on` is still to come. A done step can legitimately carry a future date —
   * an install booked for next month sits under a ticked "Ready to Install" — and a bare
   * "Oct 13" under a tick would read as though it had already happened.
   */
  future: boolean;
};

/**
 * Everything the seven steps are derived from. Dates only — no event body ever
 * reaches here, so nothing internal can be rendered from a step.
 */
export type StepInput = {
  status: Stage;
  /** The confirmed consultation appointment, mirrored onto the job. */
  visitAt?: Date | null;
  /** The most recently saved measurement on the job. */
  lastMeasuredAt?: Date | null;
  orderedOn?: string | null;
  installOn?: string | null;
  /** The first time each status was reached — see `stageDates` in ./timeline. */
  stageDates?: Partial<Record<Stage, Date>>;
  /** The confirmed install appointment, if there is one. */
  installAppointmentAt?: Date | null;
  /**
   * Today's Las Vegas day as YYYY-MM-DD, used to decide whether a step's date is still to
   * come. Injectable so this stays pure and so tests cannot turn flaky over a midnight in
   * Las Vegas; it falls back to the current day when a caller leaves it out.
   */
  today?: string;
};

/** How far the job has come. Lost is never a portal status, so it ranks below New. */
const RANKS = new Map<string, number>(STAGES.map((stage, index) => [stage.value, index]));
const rank = (status: Stage): number => RANKS.get(status) ?? -1;

/** Both resolvers return a Las Vegas day as YYYY-MM-DD, so dates stay comparable until they are formatted. */
const onDay = (day: string | null | undefined): string | null => day ?? null;
const onInstant = (at: Date | null | undefined): string | null => (at ? lasVegasDate(at) : null);

/**
 * One step's definition.
 *
 * `minStage` is the status the step's own milestone implies, and buildSteps applies it
 * centrally, so no step can be reached before the job has actually got there. `also` adds
 * the extra fact a step needs beyond that status — a saved measurement, a booked install.
 *
 * LOAD-BEARING INVARIANT: SPECS is listed in step order and `minStage` never decreases
 * along it. buildSteps reads every step before the current one as done, so a step whose
 * minStage sat below an earlier step's could be reached while that earlier one was not, and
 * the tracker would then claim a milestone the job has not passed — which is exactly the
 * false-milestone bug this gate exists to prevent. The table-driven test over
 * SPECS x PORTAL_STATUSES pins both halves: the ordering, and the gate itself.
 */
type StepSpec = {
  key: StepKey;
  label: string;
  /** The status the job must have reached before this step can be true. */
  minStage: Stage;
  /** The extra fact required beyond that status, when the status alone does not imply it. */
  also?: (input: StepInput) => boolean;
  on: (input: StepInput) => string | null;
};

/**
 * "Sep 13" within the current year, "Sep 13, 2025" outside it. A customer can come back to
 * this page for years, and a bare month and day from a previous year reads as this year.
 */
const formatStepDay = (day: string, today: string): string =>
  day.slice(0, 4) === today.slice(0, 4) ? formatMonthDay(day) : formatDateOnly(day);

/**
 * How a step's date reads to a homeowner. A date still to come is spelled out as
 * scheduled, so a step holding next month's install date cannot be misread as
 * something that has already happened.
 */
export const stepDateLabel = (step: ProjectStep): string | null =>
  step.on === null ? null : step.future ? `Scheduled ${step.on}` : step.on;

const SPECS: readonly StepSpec[] = [
  {
    key: "consultation", label: "Consultation", minStage: "visit_booked",
    on: (i) => onInstant(i.visitAt) ?? onInstant(i.stageDates?.visit_booked),
  },
  {
    // Measuring happens at or after the visit, so the visit is the stage a measurement implies.
    key: "measurements", label: "Measurements", minStage: "visit_booked",
    also: (i) => i.lastMeasuredAt != null,
    on: (i) => onInstant(i.lastMeasuredAt),
  },
  {
    key: "quote", label: "Quote Ready", minStage: "quoted",
    on: (i) => onInstant(i.stageDates?.quoted),
  },
  {
    key: "order", label: "Order Confirmed", minStage: "sold",
    on: (i) => onInstant(i.stageDates?.sold),
  },
  {
    key: "production", label: "In Production", minStage: "ordered",
    on: (i) => onDay(i.orderedOn),
  },
  {
    // A booked appointment alone is not enough. minStage is `ordered` — the stage of the step
    // below — so reaching this can never tick In Production on a job that was never ordered.
    // The install date is not lost meanwhile: the Installation section renders it from the
    // appointment itself, whatever the tracker shows.
    key: "ready", label: "Ready to Install", minStage: "ordered",
    also: (i) => i.installAppointmentAt != null,
    on: (i) => onInstant(i.installAppointmentAt),
  },
  {
    key: "installed", label: "Installed", minStage: "installed",
    on: (i) => onDay(i.installOn) ?? onInstant(i.stageDates?.installed ?? i.stageDates?.completed),
  },
];

/** Each step's minimum status, so a test can check the gate structurally rather than by example. */
export const STEP_MIN_STAGE = Object.fromEntries(
  SPECS.map((spec) => [spec.key, spec.minStage]),
) as Record<StepKey, Stage>;

/** Exposed for the same structural test: the rank of a status, as buildSteps sees it. */
export const stageRank = (status: Stage): number => rank(status);

/**
 * The seven steps for one job. Pure, given `today`: everything else it needs is passed in,
 * and `today` falls back to the current Las Vegas day only when a caller omits it.
 *
 * The spec's rule (§5): **the current step is the last one actually reached**. Everything
 * before it is done and everything after it is upcoming, so a job at `quoted` reads
 * "Quote Ready" as current and never "Order Confirmed". A step the job skipped (no
 * measurements were saved, say) is behind the customer either way, and a tracker that went
 * backwards would only confuse.
 *
 * A finished job is the one exception: once the last step is reached there is nothing left
 * in progress, so Installed reads done rather than current and the tracker is all ticks.
 *
 * A date appears only on a step the job actually reached.
 */
export function buildSteps(input: StepInput): ProjectStep[] {
  const at = rank(input.status);
  // The central gate: a step is reached only once the job's own status implies it, whatever
  // extra facts exist. This is what stops a booked appointment speaking for the job's status.
  const reached = SPECS.map((spec) => at >= rank(spec.minStage) && (spec.also?.(input) ?? true));
  const furthest = reached.lastIndexOf(true);
  const finished = furthest === SPECS.length - 1;
  const today = input.today ?? lasVegasDate(new Date());

  return SPECS.map((spec, index) => {
    const day = reached[index] ? spec.on(input) : null;
    return {
      key: spec.key,
      label: spec.label,
      state:
        index < furthest || (index === furthest && finished)
          ? "done"
          : index === furthest
            ? "current"
            : "upcoming",
      on: day ? formatStepDay(day, today) : null,
      future: day != null && day > today,
    };
  });
}
