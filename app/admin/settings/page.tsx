import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/session";
import { calendarEnabled } from "@/lib/calendar/config";
import { getSyncState } from "@/lib/calendar/store";
import { formatWhen } from "@/lib/admin/time";
import { listTeam } from "@/lib/admin/team";
import { TeamSection } from "./TeamSection";
import { InstallSection } from "./InstallSection";
import { getRouteSettings } from "@/lib/routes/settings";
import { RoutesSection } from "./RoutesSection";
import { routePlanningConfigured } from "@/lib/routes/optimize";
import { getInstallSettings, listInstallRates } from "@/lib/admin/install-rates";
import { InstallRatesSection } from "./InstallRatesSection";
import { getDefaultAssignee } from "@/lib/admin/lead-settings";
import { LeadDefaultsSection } from "./LeadDefaultsSection";
import { parseAllowlist } from "@/lib/admin/allowlist";
import { listAddedAdmins } from "@/lib/admin/admin-access";
import { AdminAccessSection } from "./AdminAccessSection";
import { listPasskeys } from "@/lib/admin/passkeys";
import { FaceIdSection } from "./FaceIdSection";
import { getDcSettings, listMarkupRules, listSeenCollections } from "@/lib/dc/store";
import { MarkupSection } from "./MarkupSection";
import { TermsSection } from "./TermsSection";
import { liveTemplateOfKind } from "@/lib/docs/templates";
import { getAgentSettings, listAgentCards, listSuppressions } from "@/lib/agents/store";
import { AgentsSection } from "./AgentsSection";
import { SettingsTabs } from "./SettingsTabs";
import { parseSettingsTab, type SettingsTab } from "./tabs";

/**
 * Settings, one tab at a time (`?tab=`, Team by default). Each tab reads only what it shows, so a
 * failing read on one tab never stops another from opening.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const admin = await requireAdmin();
  const tab = parseSettingsTab((await searchParams).tab);
  const content = await TAB_CONTENT[tab](admin.email);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsTabs active={tab} />
      {content}
    </div>
  );
}

const TAB_CONTENT: Record<SettingsTab, (email: string) => Promise<ReactNode>> = {
  team: teamTab,
  pricing: pricingTab,
  scheduling: schedulingTab,
  marketing: marketingTab,
  device: deviceTab,
};

async function teamTab(email: string) {
  // Read together, so neither rejection is left unhandled while another is awaited.
  const [team, addedAdmins, defaultAssignee] = await Promise.all([listTeam(), listAddedAdmins(), getDefaultAssignee()]);
  return (
    <>
      <TeamSection team={team} />
      <AdminAccessSection owners={parseAllowlist(process.env.ADMIN_EMAILS)} added={addedAdmins} me={email} />
      <LeadDefaultsSection team={team} defaultAssignee={defaultAssignee} />
    </>
  );
}

async function pricingTab() {
  const [rates, installSettings, rules, collections, dcSettings, termsTemplate] = await Promise.all([
    listInstallRates(),
    getInstallSettings(),
    listMarkupRules(),
    listSeenCollections(),
    getDcSettings(),
    liveTemplateOfKind("terms"),
  ]);
  return (
    <>
      <InstallRatesSection rates={rates} settings={installSettings} />
      <MarkupSection collections={collections} rules={rules} />
      <TermsSection
        template={termsTemplate ? { updatedAt: termsTemplate.updatedAt } : null}
        legacyUpload={dcSettings.termsPathname !== null}
      />
    </>
  );
}

async function schedulingTab() {
  const enabled = calendarEnabled();
  const [routeSettings, calendar] = await Promise.all([
    getRouteSettings(),
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
  const routeSetup = {
    map: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && process.env.NEXT_PUBLIC_GOOGLE_MAP_ID),
    geocoding: Boolean(process.env.GOOGLE_GEOCODING_KEY),
    planning: routePlanningConfigured(),
  };
  const { state, unreadable } = calendar;
  const { expiresAt, lastError, lastErrorAt } = state ?? { expiresAt: null, lastError: null, lastErrorAt: null };
  return (
    <>
      <RoutesSection settings={routeSettings} setup={routeSetup} />
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
    </>
  );
}

async function marketingTab() {
  // Each falls back, so Settings still loads before migration 044 (the agents tables) is applied.
  const [agents, agentSettings, suppressions] = await Promise.all([
    listAgentCards().catch((error: unknown) => {
      console.error("Could not read the agents", error);
      return [];
    }),
    getAgentSettings().catch((error: unknown) => {
      console.error("Could not read the agent settings", error);
      return { mailingAddress: null, signature: null };
    }),
    listSuppressions().catch((error: unknown) => {
      console.error("Could not read the do-not-contact list", error);
      return [];
    }),
  ]);
  return (
    <>
      <AgentsSection agents={agents} settings={agentSettings} suppressions={suppressions} />
      <section aria-labelledby="ads-heading" className="flex flex-col gap-2">
        <h2 id="ads-heading" className="text-lg font-semibold">
          Google Ads
        </h2>
        <p className="text-ink-soft">
          Leads that came from an ad click, with when each was booked and sold. Upload the file in Google Ads under
          Goals → Conversions → Uploads, so the campaign learns which searches become customers.
        </p>
        {/* A file download, not a page: a Link would try to route to it. */}
        <a href="/admin/ad-conversions" className="self-start underline underline-offset-4" download>
          Download conversions file
        </a>
      </section>
    </>
  );
}

async function deviceTab(email: string) {
  const devices = await listPasskeys(email);
  return (
    <>
      <FaceIdSection devices={devices} />
      <InstallSection />
    </>
  );
}
