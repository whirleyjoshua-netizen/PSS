import type { AppointmentKind } from "@/lib/admin/appointment-kinds";

/** "HH:MM", 24-hour, Las Vegas wall time. */
export type Clock = string;

export type RouteSettings = {
  dayStart: Clock; dayEnd: Clock;
  minutes: Record<AppointmentKind, number>;
};

/** One appointment on the day being planned, with everything the planner needs. */
export type DayStop = {
  appointmentId: string;
  jobId: string;
  name: string;
  address: string | null;
  city: string;
  kind: AppointmentKind;
  startsAt: string;          // ISO
  allDay: boolean;
  confirmed: boolean;
  windowStart: Clock | null;
  windowEnd: Clock | null;
  durationMinutes: number;   // resolved: own value, else the kind's default
  lat: number | null;
  lng: number | null;
  assignedTo: string | null;
  updatedAt: string;         // ISO
};

export type Installer = { id: string; name: string };

export type PlanStop = { appointmentId: string; arrival: string; driveMinutes: number; outsideWindow: boolean };
export type PlanRoute = { teamMemberId: string; stops: PlanStop[]; polyline: string | null; driveMinutes: number };
export type SkippedStop = { appointmentId: string; reason: string };
export type RoutePlan = { day: string; builtAt: string; routes: PlanRoute[]; skipped: SkippedStop[] };

export type SavedRoute = { plan: RoutePlan; savedAt: string; stale: boolean };
