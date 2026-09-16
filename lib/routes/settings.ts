import "server-only";
import { db } from "@/lib/db";
import type { AppointmentKind } from "@/lib/admin/appointment-kinds";
import type { RouteSettings } from "./types";

export const DEFAULT_ROUTE_SETTINGS: RouteSettings = {
  dayStart: "09:00", dayEnd: "18:00",
  minutes: { consultation: 60, measure: 60, install: 240, service: 90 },
};

export const defaultMinutes = (settings: RouteSettings, kind: AppointmentKind): number => settings.minutes[kind];

/** Never throws: a missing row or table (migration 017 not applied) plans with the defaults. */
export async function getRouteSettings(): Promise<RouteSettings> {
  try {
    const [row] = await db()`
      select day_start::text as day_start, day_end::text as day_end, consultation_minutes,
             measure_minutes, install_minutes, service_minutes
        from route_settings where id`;
    if (!row) return DEFAULT_ROUTE_SETTINGS;
    return {
      dayStart: String(row.day_start).slice(0, 5),
      dayEnd: String(row.day_end).slice(0, 5),
      minutes: {
        consultation: Number(row.consultation_minutes), measure: Number(row.measure_minutes),
        install: Number(row.install_minutes), service: Number(row.service_minutes),
      },
    };
  } catch (error) {
    console.error("Could not read route settings", error);
    return DEFAULT_ROUTE_SETTINGS;
  }
}

export async function saveRouteSettings(s: RouteSettings): Promise<void> {
  await db()`
    insert into route_settings (id, day_start, day_end, consultation_minutes, measure_minutes, install_minutes, service_minutes)
    values (true, ${s.dayStart}::time, ${s.dayEnd}::time, ${s.minutes.consultation}, ${s.minutes.measure},
            ${s.minutes.install}, ${s.minutes.service})
    on conflict (id) do update set
      day_start = excluded.day_start, day_end = excluded.day_end,
      consultation_minutes = excluded.consultation_minutes, measure_minutes = excluded.measure_minutes,
      install_minutes = excluded.install_minutes, service_minutes = excluded.service_minutes`;
}
