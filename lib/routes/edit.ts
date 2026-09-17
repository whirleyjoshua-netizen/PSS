import type { RoutePlan } from "./types";

/** Moves a stop to the end of another installer's route, creating that route when they have none. */
export function moveStop(plan: RoutePlan, appointmentId: string, toTeamMemberId: string): RoutePlan {
  const from = plan.routes.find((r) => r.stops.some((s) => s.appointmentId === appointmentId));
  if (!from || from.teamMemberId === toTeamMemberId) return plan;
  const stop = from.stops.find((s) => s.appointmentId === appointmentId)!;
  const routes = plan.routes.some((r) => r.teamMemberId === toTeamMemberId)
    ? plan.routes
    : [...plan.routes, { teamMemberId: toTeamMemberId, stops: [], polyline: null, driveMinutes: 0 }];
  return {
    ...plan,
    routes: routes.map((r) =>
      r.teamMemberId === from.teamMemberId ? { ...r, polyline: null, stops: r.stops.filter((s) => s !== stop) }
      : r.teamMemberId === toTeamMemberId ? { ...r, polyline: null, stops: [...r.stops, stop] }
      : r),
  };
}

/** Swaps a stop with its neighbour; a stop already at that end stays put. */
export function shiftStop(plan: RoutePlan, appointmentId: string, by: -1 | 1): RoutePlan {
  return {
    ...plan,
    routes: plan.routes.map((r) => {
      const i = r.stops.findIndex((s) => s.appointmentId === appointmentId);
      const j = i + by;
      if (i < 0 || j < 0 || j >= r.stops.length) return r;
      const stops = [...r.stops];
      [stops[i], stops[j]] = [stops[j], stops[i]];
      return { ...r, polyline: null, stops };
    }),
  };
}
