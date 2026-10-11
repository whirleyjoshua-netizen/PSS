import Link from "next/link";
import { SETTINGS_TABS, settingsTabHref, type SettingsTab } from "./tabs";

/** The row of Settings tabs, styled like the job page's. Each is a link, so a tab survives refresh and back. */
export function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav aria-label="Settings sections" className="overflow-x-auto border-b border-rule">
      <ul className="flex gap-6">
        {SETTINGS_TABS.map((tab) => {
          const current = tab.value === active;
          return (
            <li key={tab.value}>
              <Link
                href={settingsTabHref(tab.value)}
                aria-current={current ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 text-sm ${
                  current ? "border-charcoal font-semibold text-charcoal" : "border-transparent text-ink-soft hover:text-charcoal"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
