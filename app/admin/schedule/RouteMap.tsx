import type { DayStop, Installer, RoutePlan } from "@/lib/routes/types";

export type RouteMapProps = {
  stops: DayStop[]; plan: RoutePlan | null; installers: Installer[]; apiKey: string | null; mapId: string | null;
};

/** The day's map. Task 10 draws the routes; for now it only holds the map's place in the layout. */
export function RouteMap(_props: RouteMapProps) {
  return <div aria-hidden className="hidden min-h-80 border border-rule bg-sand/40 md:block" />;
}
