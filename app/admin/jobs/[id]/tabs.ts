export const JOB_TABS = [
  { value: "overview", label: "Overview" },
  { value: "measurements", label: "Measurements" },
  { value: "files", label: "Files" },
  { value: "install", label: "Install" },
  { value: "activity", label: "Activity" },
] as const;

export type JobTab = (typeof JOB_TABS)[number]["value"];

export const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** The tab in `?tab=`; anything missing or unknown shows the Overview. */
export function parseJobTab(value: string | string[] | undefined): JobTab {
  const tab = firstParam(value);
  return JOB_TABS.some((t) => t.value === tab) ? (tab as JobTab) : "overview";
}

export const tabHref = (jobId: string, tab: JobTab): string =>
  tab === "overview" ? `/admin/jobs/${jobId}` : `/admin/jobs/${jobId}?tab=${tab}`;
