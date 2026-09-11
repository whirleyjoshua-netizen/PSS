import { requireAdmin } from "@/lib/admin/session";

/** Reserved for account and client-portal options as later portal steps land. */
export default async function SettingsPage() {
  await requireAdmin();
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-ink-soft">
        Settings are coming soon. This is where account and client portal options will live.
      </p>
    </div>
  );
}
