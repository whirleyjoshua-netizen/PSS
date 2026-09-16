import { windowFor } from "./optimize-request";
import type { DayStop, PlanRoute, RoutePlan, RouteSettings } from "./types";

type Visit = { shipmentIndex?: number; isPickup?: boolean; startTime?: string };
type Transition = { travelDuration?: string };
type Route = { vehicleIndex?: number; visits?: Visit[]; transitions?: Transition[]; routePolyline?: { points?: string }; metrics?: { travelDuration?: string } };
export type OptimizeToursResponse = { routes?: Route[]; skippedShipments?: { index?: number; reasons?: { code?: string }[] }[] };

// Proto3 JSON omits zero values, so index 0 arrives as a missing field.
export const durationSeconds = (value: string | undefined): number => (value ? Number.parseFloat(value) : 0);
const minutes = (seconds: number) => Math.round(seconds / 60);

const FALLBACK = "It didn't fit around the other stops and their windows.";
const REASONS: Record<string, string> = {
  NO_VEHICLE: "No installer was selected for this day.",
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS: "It can't be reached within anyone's working day.",
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DURATION_LIMIT: "It is too long for the working day.",
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TRAVEL_DURATION_LIMIT: "It is too far to drive in the working day.",
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DISTANCE_LIMIT: "It is too far to drive in the working day.",
  VEHICLE_NOT_ALLOWED: "It is assigned to an installer who can't fit it in.",
  DEMAND_EXCEEDS_VEHICLE_CAPACITY: FALLBACK,
  VEHICLE_IGNORED: FALLBACK, SHIPMENT_IGNORED: FALLBACK, SKIPPED_IN_INJECTED_SOLUTION_CONSTRAINT: FALLBACK,
  VEHICLE_ROUTE_IS_FULLY_SEQUENCE_CONSTRAINED: FALLBACK, ZERO_PENALTY_COST: FALLBACK, CODE_UNSPECIFIED: FALLBACK,
};
export const reasonText = (code: string | undefined): string => (code && REASONS[code]) || FALLBACK;

export function parseOptimizeResponse(
  response: OptimizeToursResponse,
  ctx: { day: string; builtAt: string; shipments: string[]; vehicles: string[]; stops: DayStop[]; settings: RouteSettings },
): RoutePlan {
  const byId = new Map(ctx.stops.map((s) => [s.appointmentId, s]));
  const routes: PlanRoute[] = ctx.vehicles.map((teamMemberId) => ({ teamMemberId, stops: [], polyline: null, driveMinutes: 0 }));
  for (const route of response.routes ?? []) {
    const target = routes[route.vehicleIndex ?? 0];
    if (!target) continue;
    const visits = route.visits ?? [];
    target.stops = visits.map((visit, i) => {
      const appointmentId = ctx.shipments[visit.shipmentIndex ?? 0];
      const arrival = new Date(visit.startTime ?? ctx.builtAt).toISOString();
      const stop = byId.get(appointmentId);
      const w = stop ? windowFor(stop, ctx.day, ctx.settings) : null;
      return {
        appointmentId,
        arrival,
        driveMinutes: i === 0 ? 0 : minutes(durationSeconds(route.transitions?.[i]?.travelDuration)),
        outsideWindow: Boolean(stop?.windowStart && w && (arrival < w.start || arrival > w.end)),
      };
    });
    target.polyline = visits.length ? route.routePolyline?.points ?? null : null;
    target.driveMinutes = target.stops.reduce((sum, s) => sum + s.driveMinutes, 0);
  }
  const skipped = (response.skippedShipments ?? []).map((s) => ({
    appointmentId: ctx.shipments[s.index ?? 0],
    reason: reasonText(s.reasons?.[0]?.code),
  }));
  return { day: ctx.day, builtAt: ctx.builtAt, routes, skipped };
}
