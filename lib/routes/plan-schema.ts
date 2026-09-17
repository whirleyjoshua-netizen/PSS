import { z } from "zod";
import type { RoutePlan } from "./types";

export const UNAVAILABLE = "Route planning is unavailable right now";
export const CHANGED = "This day changed — rebuild first.";

const uuid = z.uuid();
const isoTime = z.iso.datetime({ offset: true });

const hasDuplicates = (values: string[]) => new Set(values).size !== values.length;

/** A route per installer, at most this many. Also caps the installer ids an action accepts. */
export const MAX_ROUTES = 50;
const MAX_STOPS = 200;
const MAX_TEXT = 10_000;

export const installerIdsSchema = z.array(uuid).max(MAX_ROUTES);

export const routePlanSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  builtAt: isoTime,
  routes: z.array(z.object({
    teamMemberId: uuid,
    polyline: z.string().max(MAX_TEXT).nullable(),
    driveMinutes: z.number().int().min(0),
    stops: z.array(z.object({
      appointmentId: uuid, arrival: isoTime, driveMinutes: z.number().int().min(0), outsideWindow: z.boolean(),
    })).max(MAX_STOPS),
  })).max(MAX_ROUTES),
  skipped: z.array(z.object({ appointmentId: uuid, reason: z.string().max(MAX_TEXT) })).max(MAX_STOPS),
})
  // One route per installer: the re-check maps each installer to one vehicle.
  .refine((plan) => !hasDuplicates(plan.routes.map((r) => r.teamMemberId)), "An installer has two routes")
  // An appointment sits in exactly one place: one stop, or the skipped list.
  .refine((plan) => !hasDuplicates([
    ...plan.routes.flatMap((r) => r.stops.map((s) => s.appointmentId)),
    ...plan.skipped.map((s) => s.appointmentId),
  ]), "An appointment is listed twice") satisfies z.ZodType<RoutePlan>;
