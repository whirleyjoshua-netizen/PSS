import { fromLocalInput } from "@/lib/admin/time";
import type { DayStop, Installer, RouteSettings } from "./types";

export type OptimizeToursRequest = Record<string, unknown>;
export type OptimizeInput = { day: string; stops: DayStop[]; installers: Installer[]; settings: RouteSettings };

/** A soft window this expensive is only broken when the owner's order leaves no other way. */
const LATE_COST_PER_HOUR = 1000;
const TRAVEL_COST_PER_HOUR = 60;

const at = (day: string, clock: string): string => fromLocalInput(`${day}T${clock}`).toISOString();

export function windowFor(stop: DayStop, day: string, settings: RouteSettings): { start: string; end: string } {
  return stop.windowStart && stop.windowEnd
    ? { start: at(day, stop.windowStart), end: at(day, stop.windowEnd) }
    : { start: at(day, settings.dayStart), end: at(day, settings.dayEnd) };
}

const routable = (stops: DayStop[]) => stops.filter((s) => s.lat !== null && s.lng !== null);

function model(input: OptimizeInput, stops: DayStop[], soft: boolean) {
  const { day, installers, settings } = input;
  const dayStart = at(day, settings.dayStart);
  const dayEnd = at(day, settings.dayEnd);
  const windows = stops.map((s) => windowFor(s, day, settings));
  const globalStartTime = [dayStart, ...windows.map((w) => w.start)].sort()[0];
  const globalEndTime = [dayEnd, ...windows.map((w) => w.end)].sort().at(-1)!;
  const shipments = stops.map((stop, i) => {
    const lockedTo = stop.assignedTo ? installers.findIndex((it) => it.id === stop.assignedTo) : -1;
    const timeWindow = soft
      ? { softStartTime: windows[i].start, softEndTime: windows[i].end,
          costPerHourBeforeSoftStartTime: LATE_COST_PER_HOUR, costPerHourAfterSoftEndTime: LATE_COST_PER_HOUR }
      : { startTime: windows[i].start, endTime: windows[i].end };
    return {
      label: stop.appointmentId,
      deliveries: [{
        arrivalLocation: { latitude: stop.lat, longitude: stop.lng },
        duration: `${stop.durationMinutes * 60}s`,
        timeWindows: [timeWindow],
      }],
      ...(lockedTo >= 0 && !soft ? { allowedVehicleIndices: [lockedTo] } : {}),
    };
  });
  const vehicles = installers.map((installer) => ({
    label: installer.id,
    travelMode: "DRIVING",
    startTimeWindows: [{ startTime: dayStart, endTime: dayEnd }],
    endTimeWindows: [{ startTime: dayStart, endTime: dayEnd }],
    costPerTraveledHour: TRAVEL_COST_PER_HOUR,
  }));
  return { globalStartTime, globalEndTime, shipments, vehicles };
}

const COMMON = { considerRoadTraffic: false, populatePolylines: true, timeout: "15s" };

export function buildOptimizeRequest(input: OptimizeInput) {
  const stops = routable(input.stops);
  return {
    body: { ...COMMON, solvingMode: "DEFAULT_SOLVE", model: model(input, stops, false) } as OptimizeToursRequest,
    shipments: stops.map((s) => s.appointmentId),
    vehicles: input.installers.map((i) => i.id),
  };
}

export function buildRecheckRequest(input: OptimizeInput, routes: { teamMemberId: string; appointmentIds: string[] }[]) {
  const onRoute = new Set(routes.flatMap((r) => r.appointmentIds));
  const stops = routable(input.stops).filter((s) => onRoute.has(s.appointmentId));
  const shipments = stops.map((s) => s.appointmentId);
  const vehicles = input.installers.map((i) => i.id);
  const injectedRoutes = routes
    .map((route) => ({
      vehicleIndex: vehicles.indexOf(route.teamMemberId),
      visits: route.appointmentIds.filter((id) => shipments.includes(id))
        .map((id) => ({ shipmentIndex: shipments.indexOf(id), isPickup: false })),
    }))
    .filter((route) => route.vehicleIndex >= 0);
  return {
    body: {
      ...COMMON,
      solvingMode: "DEFAULT_SOLVE",
      model: model(input, stops, true),
      injectedSolutionConstraint: {
        routes: injectedRoutes,
        constraintRelaxations: [{
          relaxations: [{ level: "RELAX_VISIT_TIMES_AFTER_THRESHOLD", thresholdVisitCount: 0 }],
          vehicleIndices: vehicles.map((_, i) => i),
        }],
      },
    } as OptimizeToursRequest,
    shipments,
    vehicles,
  };
}
