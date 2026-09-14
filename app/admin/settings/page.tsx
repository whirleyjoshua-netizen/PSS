import { requireAdmin } from "@/lib/admin/session";
import { calendarEnabled } from "@/lib/calendar/config";
import { getSyncState } from "@/lib/calendar/store";
import { formatWhen } from "@/lib/admin/time";

/** Reserved for account and client-portal options as later portal steps land. */
export default async function SettingsPage() {
  await requireAdmin();
  const enabled = calendarEnabled();
  const { expiresAt, lastError, lastErrorAt } = enabled
    ? await getSyncState()
    : { expiresAt: null, lastError: null, lastErrorAt: null };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section aria-labelledby="outlook-heading" className="flex flex-col gap-2">
        <h2 id="outlook-heading" className="text-lg font-semibold">
          Outlook calendar
        </h2>
        {!enabled ? (
          <p className="text-ink-soft">
            Not connected. Follow docs/outlook-setup.md to connect the shared PSS Jobs calendar.
          </p>
        ) : lastError ? (
          <p className="text-overdue">
            Connected, but the last sync failed on {formatWhen(lastErrorAt!)}: {lastError}
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
