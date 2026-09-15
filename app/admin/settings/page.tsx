import { requireAdmin } from "@/lib/admin/session";
import { calendarEnabled } from "@/lib/calendar/config";
import { getSyncState } from "@/lib/calendar/store";
import { formatWhen } from "@/lib/admin/time";
import { listTeam } from "@/lib/admin/team";
import { TeamSection } from "./TeamSection";

/** The team list, plus account and client-portal options as later portal steps land. */
export default async function SettingsPage() {
  await requireAdmin();
  const enabled = calendarEnabled();
  type Calendar = { state: Awaited<ReturnType<typeof getSyncState>> | null; unreadable: boolean };
  // Read both together, so neither rejection is left unhandled while the other is awaited.
  const [team, calendar] = await Promise.all<[ReturnType<typeof listTeam>, Promise<Calendar>]>([
    listTeam(),
    enabled
      ? getSyncState().then(
          (state) => ({ state, unreadable: false }),
          (error: unknown) => {
            // Most likely the calendar tables are missing (migration 007 not applied); say so instead of a 500.
            console.error("Could not read the calendar sync state", error);
            return { state: null, unreadable: true };
          },
        )
      : Promise.resolve({ state: null, unreadable: false }),
  ]);
  const { state, unreadable } = calendar;
  const { expiresAt, lastError, lastErrorAt } = state ?? { expiresAt: null, lastError: null, lastErrorAt: null };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <TeamSection team={team} />
      <section aria-labelledby="outlook-heading" className="flex flex-col gap-2">
        <h2 id="outlook-heading" className="text-lg font-semibold">
          Outlook calendar
        </h2>
        {!enabled ? (
          <p className="text-ink-soft">
            Not connected. Follow docs/outlook-setup.md to connect the shared PSS Jobs calendar.
          </p>
        ) : unreadable ? (
          <p className="text-overdue">
            Connected, but the calendar status couldn&apos;t be read. Has migration 007 been applied?
          </p>
        ) : lastError ? (
          <p className="text-overdue">
            {lastErrorAt
              ? `Connected, but the last sync failed on ${formatWhen(lastErrorAt)}: ${lastError}`
              : `Connected, but the last sync failed: ${lastError}`}
          </p>
        ) : expiresAt ? (
          <p className="text-ink-soft">Connected. Updates from Outlook are on until {formatWhen(expiresAt)}.</p>
        ) : (
          <p className="text-ink-soft">
            Connected. Waiting for the first daily check to switch on updates from Outlook.
          </p>
        )}
      </section>
    </div>
  );
}
