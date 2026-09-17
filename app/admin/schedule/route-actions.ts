"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { isRouteDay, listGeocodeErrors, listInstallers, loadDay, saveRoutePlan } from "@/lib/routes/day";
import { geocodeLead } from "@/lib/routes/geocode";
import { buildOptimizeRequest, buildRecheckRequest } from "@/lib/routes/optimize-request";
import { parseOptimizeResponse } from "@/lib/routes/optimize-response";
import { optimizeTours, routePlanningConfigured } from "@/lib/routes/optimize";
import { CHANGED, installerIdsSchema, routePlanSchema, UNAVAILABLE } from "@/lib/routes/plan-schema";
import { getRouteSettings } from "@/lib/routes/settings";
import type { RoutePlan, SkippedStop } from "@/lib/routes/types";

export type RouteActionResult = { ok: true; plan: RoutePlan } | { ok: false; error: string };
const UNREADABLE = { ok: false, error: "That route could not be read. Build again." } as const;

// Every action calls requireAdmin() before reading its input.

/** Runs the solver. Any failure (Google's or ours) is logged and shown only as "unavailable". */
async function solve(run: () => Promise<RoutePlan>): Promise<RouteActionResult> {
  if (!routePlanningConfigured()) return { ok: false, error: UNAVAILABLE };
  try {
    return { ok: true, plan: await run() };
  } catch (error) {
    console.error("Route planning failed", error);
    return { ok: false, error: UNAVAILABLE };
  }
}

const GEOCODE_CONCURRENCY = 5;
const NOT_ON_TEAM = "Installer no longer on the team";
const LEFT_DAY = "No longer scheduled that day";
const NEEDS_ADDRESS = "Needs an address";

/** Retries each errored lead, a few at a time. geocodeLead never throws. */
async function retryGeocodes(leadIds: string[]) {
  for (let i = 0; i < leadIds.length; i += GEOCODE_CONCURRENCY) {
    await Promise.all(leadIds.slice(i, i + GEOCODE_CONCURRENCY).map((id) => geocodeLead(id)));
  }
}

export async function buildRoutes(day: string, installerIds: string[]): Promise<RouteActionResult> {
  await requireAdmin();
  if (!isRouteDay(day)) return { ok: false, error: "Pick a day." };
  const ids = installerIdsSchema.safeParse(installerIds);
  if (!ids.success) return { ok: false, error: "Pick at least one installer." };
  const installers = (await listInstallers()).filter((i) => ids.data.includes(i.id));
  if (!installers.length) return { ok: false, error: "Pick at least one installer." };
  // The build owns the geocode retry: errored leads are looked up again before the day is read.
  await retryGeocodes(await listGeocodeErrors(day));
  const [{ stops, loadedAt }, settings] = await Promise.all([loadDay(day), getRouteSettings()]);
  if (!stops.length || !loadedAt) return { ok: false, error: "Nothing is scheduled that day." };
  if (!stops.some((s) => s.lat !== null && s.lng !== null)) {
    return { ok: false, error: "No appointment that day has a mappable address." };
  }
  return solve(async () => {
    // The database's clock, not this server's: the save guard compares builtAt with the database's updated_at.
    const builtAt = loadedAt;
    const request = buildOptimizeRequest({ day, stops, installers, settings });
    const response = await optimizeTours(request.body);
    return parseOptimizeResponse(response, { day, builtAt, stops, settings, shipments: request.shipments, vehicles: request.vehicles });
  });
}

const mergeSkipped = (...lists: SkippedStop[][]): SkippedStop[] => {
  const seen = new Set<string>();
  return lists.flat().filter((s) => !seen.has(s.appointmentId) && Boolean(seen.add(s.appointmentId)));
};

export async function recheckRoutes(day: string, plan: RoutePlan, installerIds: string[]): Promise<RouteActionResult> {
  await requireAdmin();
  const parsed = routePlanSchema.safeParse(plan);
  const ids = installerIdsSchema.safeParse(installerIds);
  if (!isRouteDay(day) || !parsed.success || !ids.success || parsed.data.day !== day) return UNREADABLE;
  const [{ stops }, team, settings] = await Promise.all([loadDay(day), listInstallers(), getRouteSettings()]);
  const installers = team.filter((i) => ids.data.includes(i.id));
  const onTeam = (r: RoutePlan["routes"][number]) => team.some((i) => i.id === r.teamMemberId);
  // Every submitted route of a real installer stays, checked or not, so unchecking someone never drops their stops.
  const routes = parsed.data.routes.filter(onTeam)
    .map((r) => ({ teamMemberId: r.teamMemberId, appointmentIds: r.stops.map((s) => s.appointmentId) }));
  // A route whose member left the installers is dropped, and its stops are shown as skipped rather than vanishing.
  const orphaned = parsed.data.routes.filter((r) => !onTeam(r))
    .flatMap((r) => r.stops.map((s) => ({ appointmentId: s.appointmentId, reason: NOT_ON_TEAM })));
  // A routed stop that is no longer on the day, or has lost its coordinates, cannot be re-checked:
  // show it as skipped with the reason instead of letting it vanish.
  const dropped = routes.flatMap((r) => r.appointmentIds).flatMap((id) => {
    const stop = stops.find((s) => s.appointmentId === id);
    if (!stop) return [{ appointmentId: id, reason: LEFT_DAY }];
    return stop.lat === null || stop.lng === null ? [{ appointmentId: id, reason: NEEDS_ADDRESS }] : [];
  });
  return solve(async () => {
    const request = buildRecheckRequest({ day, stops, installers, settings }, routes);
    const response = await optimizeTours(request.body);
    // builtAt stays the original build's, so a save still refuses if the day changed since.
    const next = parseOptimizeResponse(response, {
      day, builtAt: parsed.data.builtAt, stops, settings, shipments: request.shipments, vehicles: request.vehicles,
    });
    return { ...next, skipped: mergeSkipped(parsed.data.skipped, orphaned, dropped, next.skipped) };
  });
}

export async function saveRoutes(day: string, plan: RoutePlan): Promise<{ ok: true } | { ok: false; error: string }> {
  const { email } = await requireAdmin();
  const parsed = routePlanSchema.safeParse(plan);
  if (!isRouteDay(day) || !parsed.success || parsed.data.day !== day) return UNREADABLE;
  const result = await saveRoutePlan(parsed.data, email);
  if (result === "changed") return { ok: false, error: CHANGED };
  if (result === "unknown-installer") return { ok: false, error: "An installer on this route no longer exists. Build again." };
  revalidatePath("/admin/schedule");
  revalidatePath("/admin");
  revalidatePath("/admin/jobs/[id]", "page");
  return { ok: true };
}
