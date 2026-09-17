"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/forms/Field";
import { APPOINTMENT_KINDS } from "@/lib/admin/appointment-kinds";
import type { RouteSettings } from "@/lib/routes/types";
import { hoursLabel, WINDOW_OPTIONS } from "@/lib/routes/window";
import { saveRouteSettingsAction, type RouteSettingsState } from "./actions";

const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";

/** Whether each Google piece has its settings. Only yes or no, so no key value ever reaches the page. */
export type RouteSetup = { map: boolean; geocoding: boolean; planning: boolean };

const SETUP_PIECES = [
  { key: "planning", label: "Route planning" },
  { key: "map", label: "Map" },
  { key: "geocoding", label: "Address lookup" },
] as const;

const DAY_FIELDS = [
  { name: "dayStart", label: "Day starts" },
  { name: "dayEnd", label: "Day ends" },
] as const;

/** The working day routes are planned in, and how long each kind of appointment takes by default. */
export function RoutesSection({ settings, setup }: { settings: RouteSettings; setup: RouteSetup }) {
  const [state, action, saving] = useActionState<RouteSettingsState, FormData>(saveRouteSettingsAction, {});

  return (
    <section aria-labelledby="routes-heading" className="flex flex-col gap-3">
      <h2 id="routes-heading" className="text-lg font-semibold">
        Routes
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {SETUP_PIECES.map((piece) => (
          <li key={piece.key} className={setup[piece.key] ? "text-ink-soft" : "text-overdue"}>
            {setup[piece.key]
              ? `${piece.label} is connected.`
              : `${piece.label} is not set up yet. Follow docs/route-setup.md.`}
          </li>
        ))}
      </ul>
      <form action={action} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {DAY_FIELDS.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={`routes-${field.name}`}>{field.label}</Label>
              <select id={`routes-${field.name}`} name={field.name} defaultValue={settings[field.name]} className={CONTROL}>
                {WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {APPOINTMENT_KINDS.map((kind) => (
            <div key={kind.value} className="flex flex-col gap-2">
              <Label htmlFor={`routes-${kind.value}-hours`}>{`${kind.label} length (hours)`}</Label>
              <input
                id={`routes-${kind.value}-hours`}
                type="number"
                step="0.25"
                min="0.25"
                max="12"
                required
                name={`${kind.value}Hours`}
                defaultValue={hoursLabel(settings.minutes[kind.value])}
                className={CONTROL}
              />
            </div>
          ))}
        </div>
        <div>
          <Button type="submit" disabled={saving}>
            Save
          </Button>
        </div>
        {state.ok ? (
          <p role="status" className="text-sm text-ink-soft">
            Saved.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-sm text-overdue">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
