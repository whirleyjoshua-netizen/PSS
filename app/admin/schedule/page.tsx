import { requireAdmin } from "@/lib/admin/session";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

type SearchParams = { view?: string | string[]; week?: string | string[]; month?: string | string[]; day?: string | string[] };

const pick = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const view = pick(params.view);

  if (view === "month") {
    return await MonthView({ month: pick(params.month), day: pick(params.day) });
  }
  return await WeekView({ week: pick(params.week) });
}
