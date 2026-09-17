import Link from "next/link";
import { formatTime } from "@/lib/admin/time";
import { mapsDirectionsUrls } from "@/lib/routes/maps-link";
import { adminWindowLabel } from "@/lib/routes/window";
import type { DayStop, Installer, RoutePlan } from "@/lib/routes/types";

export type RouteListsProps = {
  stops: DayStop[];
  installers: Installer[];
  plan: RoutePlan | null;
  pending: boolean;
  onMove: (appointmentId: string, toTeamMemberId: string) => void;
  onShift: (appointmentId: string, by: -1 | 1) => void;
};

const hasCoordinates = (s: DayStop): s is DayStop & { lat: number; lng: number } => s.lat !== null && s.lng !== null;
const CONTROL = "min-h-11 border border-rule bg-ivory px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60";

/** The day's appointments before a build, or each installer's ordered stops after one, plus what could not be routed. */
export function RouteLists({ stops, installers, plan, pending, onMove, onShift }: RouteListsProps) {
  const byId = new Map(stops.map((s) => [s.appointmentId, s]));
  const nameOf = (id: string) => byId.get(id)?.name ?? "Removed appointment";
  const needsAddress = stops.filter((s) => !hasCoordinates(s));
  // An appointment with no address is already listed under Needs address; don't list it as didn't fit too.
  const noAddress = new Set(needsAddress.map((s) => s.appointmentId));
  const didntFit = plan?.skipped.filter((s) => !noAddress.has(s.appointmentId)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {plan ? (
        plan.routes.map((route) => {
          const installer = installers.find((i) => i.id === route.teamMemberId);
          const headingId = `route-${route.teamMemberId}`;
          const directions = mapsDirectionsUrls(
            route.stops.map((s) => byId.get(s.appointmentId)).filter((s): s is DayStop => Boolean(s)).filter(hasCoordinates),
          );
          return (
            <section key={route.teamMemberId} aria-labelledby={headingId} className="flex flex-col gap-2">
              <h2 id={headingId} className="text-lg font-semibold text-charcoal">
                {`${installer?.name ?? "Former installer"} · ${route.driveMinutes} min driving`}
              </h2>
              {route.stops.length ? (
                <ol className="flex flex-col gap-2">
                  {route.stops.map((s, index) => {
                    const name = nameOf(s.appointmentId);
                    return (
                      <li key={s.appointmentId} className="flex flex-wrap items-center gap-2 border border-rule p-2 text-sm">
                        <span className="font-semibold">{index + 1}</span>
                        <span className="flex-1">{name}</span>
                        <span>{formatTime(new Date(s.arrival))}</span>
                        {s.outsideWindow ? <span className="text-overdue">Misses its window</span> : null}
                        <select
                          aria-label={`Move ${name} to`}
                          value={route.teamMemberId}
                          disabled={pending}
                          onChange={(e) => onMove(s.appointmentId, e.target.value)}
                          className={CONTROL}
                        >
                          {installers.map((i) => (
                            <option key={i.id} value={i.id} disabled={i.id === route.teamMemberId}>{i.name}</option>
                          ))}
                        </select>
                        <button type="button" aria-label={`Move ${name} up`} disabled={pending || index === 0}
                          onClick={() => onShift(s.appointmentId, -1)} className={CONTROL}>↑</button>
                        <button type="button" aria-label={`Move ${name} down`} disabled={pending || index === route.stops.length - 1}
                          onClick={() => onShift(s.appointmentId, 1)} className={CONTROL}>↓</button>
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="text-sm text-ink-soft">No stops.</p>}
              {directions.map((href, part) => (
                <a key={href} href={href} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">
                  {directions.length > 1 ? `Open in Google Maps (part ${part + 1})` : "Open in Google Maps"}
                </a>
              ))}
            </section>
          );
        })
      ) : (
        <ol aria-label="Appointments" className="flex flex-col gap-2">
          {stops.filter(hasCoordinates).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((s) => {
            const window = adminWindowLabel(s.windowStart, s.windowEnd);
            return (
              <li key={s.appointmentId} className="flex flex-col border border-rule p-2 text-sm">
                <span>{`${s.name} · ${s.city}`}</span>
                {window ? <span className="text-ink-soft">{`Arrives ${window}`}</span> : null}
                {s.confirmed ? null : <span className="text-ink-soft">Pending</span>}
              </li>
            );
          })}
        </ol>
      )}

      {didntFit.length ? (
        <section aria-labelledby="route-skipped" className="flex flex-col gap-2">
          <h2 id="route-skipped" className="text-lg font-semibold text-charcoal">{`Didn't fit (${didntFit.length})`}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {didntFit.map((s) => <li key={s.appointmentId}>{`${nameOf(s.appointmentId)} — ${s.reason}`}</li>)}
          </ul>
        </section>
      ) : null}

      {needsAddress.length ? (
        <section aria-labelledby="route-needs-address" className="flex flex-col gap-2">
          <h2 id="route-needs-address" className="text-lg font-semibold text-charcoal">{`Needs address (${needsAddress.length})`}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {needsAddress.map((s) => (
              <li key={s.appointmentId}>
                <Link href={`/admin/jobs/${s.jobId}`} className="underline underline-offset-4">{s.name}</Link>
                {" "}<span className="text-ink-soft">Add or fix the address on the job page.</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
