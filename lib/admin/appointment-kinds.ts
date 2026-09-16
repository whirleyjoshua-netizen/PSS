import type { IconName } from "@/components/admin/icons";

/** The kinds of appointment a job can hold, one of each at a time. Safe to import from client components. */
export const APPOINTMENT_KINDS = [
  { value: "consultation", label: "Consultation", icon: "calendar" },
  { value: "measure", label: "Measure", icon: "ruler" },
  { value: "install", label: "Install", icon: "wrench" },
  { value: "service", label: "Service", icon: "phone" },
] as const satisfies readonly { value: string; label: string; icon: IconName }[];

export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number]["value"];

export const isAppointmentKind = (value: unknown): value is AppointmentKind =>
  APPOINTMENT_KINDS.some((kind) => kind.value === value);

// Typed from APPOINTMENT_KINDS, so a kind added there without a label here fails typecheck.
// The job activity text builds its own label in SQL with initcap(kind) (see cancelAppointment
// in lib/admin/appointments.ts), so a future kind whose label is not simple title case must be
// changed in both places together.
const KIND_LABELS: { [K in AppointmentKind]: Extract<(typeof APPOINTMENT_KINDS)[number], { value: K }>["label"] } = {
  consultation: "Consultation",
  measure: "Measure",
  install: "Install",
  service: "Service",
};

export const kindLabel = (kind: AppointmentKind): string => KIND_LABELS[kind];

/** Complete literal class names so Tailwind generates them; never build these by concatenation. */
export const APPOINTMENT_STYLE: Record<AppointmentKind, { icon: IconName; tint: string; edge: string; left: string }> = {
  consultation: { icon: "calendar", tint: "text-appt-consult", edge: "border-t-appt-consult", left: "border-l-appt-consult" },
  measure: { icon: "ruler", tint: "text-appt-measure", edge: "border-t-appt-measure", left: "border-l-appt-measure" },
  install: { icon: "wrench", tint: "text-appt-install", edge: "border-t-appt-install", left: "border-l-appt-install" },
  service: { icon: "phone", tint: "text-appt-service", edge: "border-t-appt-service", left: "border-l-appt-service" },
};
