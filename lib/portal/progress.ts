import { STAGES, type Stage } from "@/lib/admin/stages";
import { formatMonthDay, lasVegasDate } from "@/lib/admin/time";

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
};

/** How far the job has come. Lost is never a portal status, so it ranks below New. */
const RANKS = new Map<string, number>(STAGES.map((stage, index) => [stage.value, index]));
const rank = (status: Stage): number => RANKS.get(status) ?? -1;

/** Both resolvers return a Las Vegas day as YYYY-MM-DD, so dates stay comparable until they are formatted. */
const onDay = (day: string | null | undefined): string | null => day ?? null;
const onInstant = (at: Date | null | undefined): string | null => (at ? lasVegasDate(at) : null);

type StepSpec = {
  key: StepKey;
  label: string;
  reached: (input: StepInput, at: number) => boolean;
  on: (input: StepInput) => string | null;
};

/**
 * How a step's date reads to a homeowner. A date still to come is spelled out as
 * scheduled, so a ticked step holding next month's install date cannot be misread
 * as something that has already happened.
 */
export const stepDateLabel = (step: ProjectStep): string | null =>
  step.on === null ? null : step.future ? `Scheduled ${step.on}` : step.on;

const SPECS: readonly StepSpec[] = [
  {
    key: "consultation", label: "Consultation",
    reached: (_input, at) => at > rank("new"),
    on: (i) => onInstant(i.visitAt) ?? onInstant(i.stageDates?.visit_booked),
  },
  {
    key: "measurements", label: "Measurements",
    reached: (i) => i.lastMeasuredAt != null,
    on: (i) => onInstant(i.lastMeasuredAt),
  },
  {
    key: "quote", label: "Quote Ready",
    reached: (_input, at) => at >= rank("quoted"),
    on: (i) => onInstant(i.stageDates?.quoted),
  },
  {
    key: "order", label: "Order Confirmed",
    reached: (_input, at) => at >= rank("sold"),
    on: (i) => onInstant(i.stageDates?.sold),
  },
  {
    key: "production", label: "In Production",
    reached: (_input, at) => at >= rank("ordered"),
    on: (i) => onDay(i.orderedOn),
  },
  {
    key: "ready", label: "Ready to Install",
    reached: (i) => i.installAppointmentAt != null,
    on: (i) => onInstant(i.installAppointmentAt),
  },
  {
    key: "installed", label: "Installed",
    reached: (_input, at) => at >= rank("installed"),
    on: (i) => onDay(i.installOn) ?? onInstant(i.stageDates?.installed ?? i.stageDates?.completed),
  },
];

/**
 * The seven steps for one job. Pure: everything it needs is passed in.
 *
 * Every step up to the furthest one reached reads as done — a step the job skipped
 * (no measurements were saved, say) is behind the customer either way, and a tracker
 * that went backwards would only confuse. The step after it is the current one, so a
 * job whose every step is reached shows all done and nothing current. A date appears
 * only on a step the job actually reached.
 */
export function buildSteps(input: StepInput): ProjectStep[] {
  const at = rank(input.status);
  const reached = SPECS.map((spec) => spec.reached(input, at));
  const furthest = reached.lastIndexOf(true);
  const today = lasVegasDate(new Date());

  return SPECS.map((spec, index) => {
    const day = reached[index] ? spec.on(input) : null;
    return {
      key: spec.key,
      label: spec.label,
      state: index <= furthest ? "done" : index === furthest + 1 && furthest >= 0 ? "current" : "upcoming",
      on: day ? formatMonthDay(day) : null,
      future: day != null && day > today,
    };
  });
}
