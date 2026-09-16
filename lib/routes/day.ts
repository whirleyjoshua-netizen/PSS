import "server-only";
import { db } from "@/lib/db";
import { fromLocalInput } from "@/lib/admin/time";
import type { AppointmentKind } from "@/lib/admin/appointment-kinds";
import { defaultMinutes, getRouteSettings } from "./settings";
import { isRouteStale } from "./stale";
import { addDaysIso, clockOf } from "./window";
import type { DayStop, Installer, PlanRoute, RoutePlan, SavedRoute } from "./types";

/** Given to a routable appointment that a saved day counts but no installer's route holds. */
export const DIDNT_FIT_REASON = "Did not fit when the route was saved";

export const isRouteDay = (value: string | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const noon = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(noon.getTime()) && noon.toISOString().slice(0, 10) === value;
};

const iso = (v: unknown) => new Date(v as string | Date).toISOString();
const hasCoordinates = (stop: DayStop) => stop.lat !== null && stop.lng !== null;

// Postgres keeps microseconds and JavaScript dates keep milliseconds, so every compared timestamp is cut to milliseconds.
/** Las Vegas midnight to the next Las Vegas midnight. */
const dayBounds = (date: string) => ({
  from: fromLocalInput(`${date}T00:00`),
  to: fromLocalInput(`${addDaysIso(date, 1)}T00:00`),
});

async function readDay(date: string) {
  const { from, to } = dayBounds(date);
  return db()`
    select a.id, a.lead_id, a.kind, a.starts_at, a.all_day, a.confirmed_at,
           date_trunc('milliseconds', a.updated_at) as updated_at,
           a.window_start::text as window_start, a.window_end::text as window_end, a.duration_minutes,
           l.name, l.address, l.city, l.lat, l.lng, l.geocode_status, l.assigned_to
      from appointments a join leads l on l.id = a.lead_id
     where l.status <> 'lost' and a.starts_at >= ${from} and a.starts_at < ${to}
     order by a.starts_at`;
}

export async function loadDay(date: string): Promise<DayStop[]> {
  // Never calls Google: an errored lead is retried by the next build.
  const rows = await readDay(date);
  const settings = await getRouteSettings();
  return rows.map((r) => ({
    appointmentId: r.id as string, jobId: r.lead_id as string, name: r.name as string,
    address: (r.address as string | null) ?? null, city: r.city as string, kind: r.kind as AppointmentKind,
    startsAt: iso(r.starts_at), allDay: r.all_day === true, confirmed: r.confirmed_at !== null,
    windowStart: clockOf(r.window_start), windowEnd: clockOf(r.window_end),
    durationMinutes: (r.duration_minutes as number | null) ?? defaultMinutes(settings, r.kind as AppointmentKind),
    lat: (r.lat as number | null) ?? null, lng: (r.lng as number | null) ?? null,
    assignedTo: (r.assigned_to as string | null) ?? null, updatedAt: iso(r.updated_at),
  }));
}

export async function listInstallers(): Promise<Installer[]> {
  const rows = await db()`select id, name from team_members where role = 'installer' order by lower(name), created_at`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
}

const emptyRoute = (teamMemberId: string): PlanRoute => ({ teamMemberId, stops: [], polyline: null, driveMinutes: 0 });

/**
 * The saved routes for a day, with a route (empty when nothing is saved for them) for every installer so a
 * stop can be moved to anyone. The day's routable appointments on no route come back as didn't-fit, so
 * saving the loaded plan again passes the save guard. Stops are keyed per appointment, never by coordinates.
 */
export async function loadSavedPlan(date: string, day: DayStop[]): Promise<SavedRoute | null> {
  const rows = await db()`
    select appointment_id, team_member_id, position, planned_arrival, drive_minutes,
           date_trunc('milliseconds', saved_at) as saved_at, saved_count,
           route_date::text as route_date
      from route_stops where route_date = ${date}::date order by team_member_id, position`;
  if (!rows.length) return null;
  const installers = await listInstallers();
  const routes = new Map(installers.map((i) => [i.id, emptyRoute(i.id)]));
  for (const r of rows) {
    const id = r.team_member_id as string;
    const route = routes.get(id) ?? emptyRoute(id);
    route.stops.push({ appointmentId: r.appointment_id as string, arrival: iso(r.planned_arrival),
      driveMinutes: r.drive_minutes as number, outsideWindow: false });
    route.driveMinutes += r.drive_minutes as number;
    routes.set(id, route);
  }
  const savedRows = rows.map((r) => ({ appointmentId: r.appointment_id as string, savedAt: iso(r.saved_at),
    routeDate: r.route_date as string, savedCount: r.saved_count as number }));
  const savedAt = savedRows.map((r) => r.savedAt).sort().at(-1)!;
  const onRoute = new Set(savedRows.map((r) => r.appointmentId));
  // Leftovers count as didn't-fit only when they are exactly what was saved as didn't-fit. Otherwise
  // (a lead geocoded or an appointment changed since) they stay unrouted and a save forces a rebuild.
  const routable = day.filter(hasCoordinates);
  const leftovers = routable.filter((s) => !onRoute.has(s.appointmentId));
  const savedCount = Math.max(...savedRows.map((r) => r.savedCount));
  const skipped = routable.length === savedCount && !leftovers.some((s) => s.updatedAt > savedAt)
    ? leftovers.map((s) => ({ appointmentId: s.appointmentId, reason: DIDNT_FIT_REASON }))
    : [];
  return {
    plan: { day: date, builtAt: savedAt, routes: [...routes.values()], skipped },
    savedAt,
    stale: isRouteStale(savedRows, day),
  };
}

export type SaveRouteResult = "ok" | "changed" | "unknown-installer";

const RACE_CODES = new Set(["40001", "23505"]);

/*
 * Shared by both queries of the save transaction. $1 stops JSON, $2 day start, $3 day end, $4 builtAt,
 * $5 planned ids (stops then didn't-fit). The day set counts only appointments whose lead has coordinates.
 */
const SAVE_GUARD = `
  input as (
    select * from jsonb_to_recordset($1::jsonb)
      as x(appointment_id uuid, team_member_id uuid, position int, planned_arrival timestamptz, drive_minutes int)
  ),
  day as (
    select a.id, a.lead_id, a.updated_at from appointments a join leads l on l.id = a.lead_id
     where l.status <> 'lost' and a.starts_at >= $2 and a.starts_at < $3
       and l.lat is not null and l.lng is not null
  ),
  guard as (
    select (exists (select 1 from day d where date_trunc('milliseconds', d.updated_at) > $4::timestamptz)
        or (select count(*) from day) <> cardinality($5::uuid[])
        or exists (select 1 from day d where not (d.id = any($5::uuid[])))
        or exists (select 1 from unnest($5::uuid[]) p(id) where p.id not in (select id from day))) as changed,
           exists (select 1 from input i where not exists (
             select 1 from team_members m where m.id = i.team_member_id and m.role = 'installer')) as unknown
  )`;

/** $6 route date. */
const CLEAR_DAY = `
  with ${SAVE_GUARD},
  cleared as (
    delete from route_stops where route_date = $6::date
      and not (select changed or unknown from guard)
    returning id
  )
  select (select changed from guard)::int as changed, (select unknown from guard)::int as unknown,
         (select count(*) from cleared)::int as cleared`;

/** $6 route date, $7 saved count (stops + didn't-fit), $8 actor. */
const WRITE_DAY = `
  with ${SAVE_GUARD},
  inserted as (
    insert into route_stops (route_date, appointment_id, team_member_id, position, planned_arrival, drive_minutes, saved_count)
    select $6::date, i.appointment_id, i.team_member_id, i.position, i.planned_arrival, i.drive_minutes, $7::int
      from input i where not (select changed or unknown from guard)
    on conflict (appointment_id) do update set
      route_date = excluded.route_date, team_member_id = excluded.team_member_id, position = excluded.position,
      planned_arrival = excluded.planned_arrival, drive_minutes = excluded.drive_minutes,
      saved_count = excluded.saved_count, saved_at = now()
    returning appointment_id, team_member_id
  ),
  reassigned as (
    update leads l set assigned_to = i.team_member_id, updated_at = now()
      from inserted i join day d on d.id = i.appointment_id
     where l.id = d.lead_id and l.assigned_to is distinct from i.team_member_id
    returning l.id, i.team_member_id
  ),
  logged as (
    insert into job_events (lead_id, actor, kind, body)
    select r.id, $8, 'edit', 'Assigned to ' || m.name || ' (Installer) by route'
      from reassigned r join team_members m on m.id = r.team_member_id
    returning id
  )
  select (select count(*) from inserted)::int as saved, (select count(*) from logged)::int as logged`;

/**
 * Replaces the day's saved routes. `plan.skipped` carries the didn't-fit appointment ids: with the stops
 * they must be exactly the day's appointments with coordinates, none changed since `plan.builtAt`, or
 * nothing is written ("changed"). One transaction: the first query clears the day, the second inserts,
 * reassigns and logs, and each writes only when the same guard passes.
 */
export async function saveRoutePlan(plan: RoutePlan, actor: string): Promise<SaveRouteResult> {
  const stops = plan.routes.flatMap((route) => route.stops.map((stop, i) => ({
    appointment_id: stop.appointmentId, team_member_id: route.teamMemberId, position: i + 1,
    planned_arrival: stop.arrival, drive_minutes: stop.driveMinutes,
  })));
  const planned = [...stops.map((s) => s.appointment_id), ...plan.skipped.map((s) => s.appointmentId)];
  const { from, to } = dayBounds(plan.day);
  const guardParams = [JSON.stringify(stops), from, to, plan.builtAt, planned, plan.day];
  const sql = db();
  let checked: Record<string, unknown>[];
  try {
    [checked] = await sql.transaction([
      sql.query(CLEAR_DAY, guardParams),
      sql.query(WRITE_DAY, [...guardParams, planned.length, actor]),
    ], { isolationLevel: "RepeatableRead" });
  } catch (error) {
    // A concurrent save (serialization failure or a position/appointment collision) means the day moved on.
    if (RACE_CODES.has((error as { code?: string } | null)?.code ?? "")) return "changed";
    throw error;
  }
  const result = checked?.[0] as { changed?: number; unknown?: number } | undefined;
  if (result?.changed) return "changed";
  if (result?.unknown) return "unknown-installer";
  return "ok";
}

export type RouteNote = { windowStart: string | null; windowEnd: string | null; plannedArrival: Date | null };

/** Arrival windows and saved arrival times for the week view, keyed `${leadId}:${kind}`. */
export async function routeNotes(from: Date, to: Date): Promise<Map<string, RouteNote>> {
  const rows = await db()`
    select a.lead_id, a.kind, a.window_start::text as window_start, a.window_end::text as window_end, s.planned_arrival
      from appointments a
      left join route_stops s on s.appointment_id = a.id
       and s.route_date = (a.starts_at at time zone 'America/Los_Angeles')::date
     where a.starts_at >= ${from} and a.starts_at < ${to}
       and (a.window_start is not null or s.planned_arrival is not null)`;
  return new Map(rows.map((r) => [`${r.lead_id}:${r.kind}`, {
    windowStart: clockOf(r.window_start), windowEnd: clockOf(r.window_end),
    plannedArrival: r.planned_arrival ? new Date(r.planned_arrival as string | Date) : null,
  }]));
}
