import { requireAdmin } from "@/lib/admin/session";
import { getMonth, getWeek } from "@/lib/calendar/week";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

type SearchParams = { view?: string | string[]; week?: string | string[]; month?: string | string[]; day?: string | string[] };

const pick = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const view = pick(params.view);
  const now = new Date();

  if (view === "month") {
    const day = pick(params.day);
    const data = await getMonth(pick(params.month), now);
    return <MonthView {...data} day={day} now={now} />;
  }
  const data = await getWeek(pick(params.week), now);
  return <WeekView {...data} now={now} />;
}
