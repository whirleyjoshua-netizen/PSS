"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { moveStop, shiftStop } from "@/lib/routes/edit";
import { UNAVAILABLE } from "@/lib/routes/plan-schema";
import { addDaysIso } from "@/lib/routes/window";
import type { DayStop, Installer, RoutePlan, SavedRoute } from "@/lib/routes/types";
import { buildRoutes, recheckRoutes, saveRoutes } from "./route-actions";
import { RouteLists } from "./RouteLists";
import { RouteMap } from "./RouteMap";
import { ScheduleHeader } from "./ScheduleHeader";

export type RouteViewProps = {
  day: string; today: string; stops: DayStop[]; installers: Installer[];
  saved: SavedRoute | null; configured: boolean; mapsKey: string | null; mapId: string | null;
};

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

export function RouteView({ day, stops, installers, saved, configured, mapsKey, mapId }: RouteViewProps) {
  const [selected, setSelected] = useState<string[]>(() => installers.map((i) => i.id));
  const [plan, setPlan] = useState<RoutePlan | null>(saved?.plan ?? null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const buildBlocker = selected.length === 0 ? "Pick at least one installer."
    : stops.length === 0 ? "Nothing is scheduled that day." : null;

  const toggle = (id: string) =>
    setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  const build = () => {
    setNotice(null);
    // The page already knows planning is off, so no round trip is spent finding out.
    if (!configured) return setError(UNAVAILABLE);
    startTransition(async () => {
      const result = await buildRoutes(day, selected);
      if (result.ok) {
        setPlan(result.plan);
        setDirty(true);
        setError(null);
      } else setError(result.error);
    });
  };

  const edit = (next: RoutePlan) => {
    setPlan(next);
    setDirty(true);
    setNotice(null);
    startTransition(async () => {
      const result = await recheckRoutes(day, next, selected);
      if (result.ok) {
        setPlan(result.plan);
        setError(null);
      } else setError(result.error);
    });
  };

  const save = () => {
    if (!plan) return;
    startTransition(async () => {
      const result = await saveRoutes(day, plan);
      if (result.ok) {
        setDirty(false);
        setError(null);
        setNotice("Routes saved.");
      } else setError(result.error);
    });
  };

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
      <ScheduleHeader
        label={dayLabel(day)}
        view="route"
        switchHrefs={{
          week: `/admin/schedule?week=${day}`,
          month: `/admin/schedule?view=month&month=${day.slice(0, 7)}`,
          route: `/admin/schedule?view=route&day=${day}`,
        }}
        nav={{
          label: "Days",
          previous: { href: `/admin/schedule?view=route&day=${addDaysIso(day, -1)}`, text: "← Previous day" },
          current: { href: "/admin/schedule?view=route", text: "Today", icon: true },
          next: { href: `/admin/schedule?view=route&day=${addDaysIso(day, 1)}`, text: "Next day →" },
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Installers</legend>
          {installers.map((i) => (
            <label key={i.id} className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
              <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} />
              {i.name}
            </label>
          ))}
        </fieldset>
        <Button variant="solid" disabled={pending || Boolean(buildBlocker)} onClick={build}>Build routes</Button>
        <Button variant="outline" disabled={pending || !dirty || !plan} onClick={save}>Save routes</Button>
        {buildBlocker ? <p className="text-sm text-ink-soft">{buildBlocker}</p> : null}
      </div>
      {saved?.stale && !dirty ? <p role="status" className="text-sm text-overdue">Route is out of date — rebuild</p> : null}
      {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-ink-soft">{notice}</p> : null}
      {/* The map comes first, so on a phone it sits above the lists. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <RouteMap stops={stops} plan={plan} installers={installers} apiKey={mapsKey} mapId={mapId} />
        <RouteLists
          stops={stops} installers={installers} plan={plan} pending={pending}
          onMove={(id, to) => plan && edit(moveStop(plan, id, to))}
          onShift={(id, by) => plan && edit(shiftStop(plan, id, by))}
        />
      </div>
    </div>
  );
}
