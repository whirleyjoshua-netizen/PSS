import type { Stage } from "@/lib/admin/stages";

/** The stages a customer can see, in order. Earlier stages and Lost are never shown. */
export const PORTAL_STAGES = ["quoted", "sold", "ordered", "installed"] as const;
export type PortalStage = (typeof PORTAL_STAGES)[number];

export const isPortalStage = (stage: Stage): stage is PortalStage =>
  (PORTAL_STAGES as readonly string[]).includes(stage);

/** The only place the customer-facing stage words live. */
const LABELS: Record<PortalStage, string> = {
  quoted: "Quote ready",
  sold: "Order confirmed",
  ordered: "In production",
  installed: "Installed",
};

export type ProgressStep = {
  stage: PortalStage;
  label: string;
  state: "done" | "current" | "upcoming";
  detail: string | null;
};

/** "2026-10-13" → "Tue, Oct 13". Read at noon UTC so the day never shifts. */
export function formatInstallDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function detailFor(stage: PortalStage, installOn: string | null): string | null {
  if (stage === "quoted") return "We've put together your quote.";
  if (stage === "ordered" && installOn) return `Install scheduled: ${formatInstallDay(installOn)}`;
  if (stage === "installed" && installOn) return `Installed ${formatInstallDay(installOn)}`;
  return null;
}

export function progressSteps(stage: PortalStage, installOn: string | null): ProgressStep[] {
  const current = PORTAL_STAGES.indexOf(stage);
  return PORTAL_STAGES.map((s, index) => ({
    stage: s,
    label: LABELS[s],
    state: index < current ? "done" : index === current ? "current" : "upcoming",
    detail: index === current ? detailFor(s, installOn) : null,
  }));
}
