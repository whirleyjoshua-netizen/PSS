import { requireAdmin } from "@/lib/admin/session";
import { lasVegasDate } from "@/lib/admin/time";
import { getMonth, getWeek } from "@/lib/calendar/week";
import { isRouteDay, listInstallers, loadDay, loadSavedPlan } from "@/lib/routes/day";
import { routePlanningConfigured } from "@/lib/routes/optimize";
import { MonthView } from "./MonthView";
import { RouteView } from "./RouteView";
import { WeekView } from "./WeekView";

type SearchParams = { view?: string | string[]; week?: string | string[]; month?: string | string[]; day?: string | string[] };

const pick = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const view = pick(params.view);
  const now = new Date();

  if (view === "route") {
    const requested = pick(params.day);
    const today = lasVegasDate(now);
    const day = isRouteDay(requested) ? requested : today;
    const [{ stops }, installers] = await Promise.all([loadDay(day), listInstallers()]);
    const saved = await loadSavedPlan(day, stops);
    return (
      <RouteView
        day={day} today={today} stops={stops} installers={installers} saved={saved}
        configured={routePlanningConfigured()}
        mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || null}
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || null}
      />
    );
  }
  if (view === "month") {
    const day = pick(params.day);
    const data = await getMonth(pick(params.month), now);
    return <MonthView {...data} day={day} now={now} />;
  }
  const data = await getWeek(pick(params.week), now);
  return <WeekView {...data} now={now} />;
}
