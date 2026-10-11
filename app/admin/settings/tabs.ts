export const SETTINGS_TABS = [
  { value: "team", label: "Team" },
  { value: "pricing", label: "Pricing" },
  { value: "scheduling", label: "Scheduling" },
  { value: "marketing", label: "Marketing" },
  { value: "device", label: "This device" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

/** The tab in `?tab=`; anything missing or unknown shows Team. */
export function parseSettingsTab(value: string | string[] | undefined): SettingsTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return SETTINGS_TABS.some((t) => t.value === tab) ? (tab as SettingsTab) : "team";
}

export const settingsTabHref = (tab: SettingsTab): string =>
  tab === "team" ? "/admin/settings" : `/admin/settings?tab=${tab}`;
