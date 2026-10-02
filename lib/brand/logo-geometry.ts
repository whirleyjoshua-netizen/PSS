/**
 * The Premier Shade Solutions mark's geometry and the lockup's proportions: the one source the
 * website's <Logo> and the print master (public/brand/logo-master.pdf) are both drawn from.
 * Proportions are measured from logofiles/ChatGPT Image Aug 26, 2026, 12_32_40 AM.png.
 */

export type Tone = "light" | "dark";
export type Point = [x: number, y: number];

/** x = left edge, top = upper-left y, bottom = lower-left y, in the 76 × 106 viewBox. Shear applied below. */
export const PANELS = [
  { x: 0, top: 0, bottom: 100, light: "var(--color-charcoal)", dark: "var(--color-ivory)", print: "#1E1E1E" },
  { x: 18, top: 12, bottom: 94, light: "var(--color-taupe)", dark: "#B3AAA0", print: "#7A7263" },
  { x: 36, top: 23, bottom: 90, light: "var(--color-champagne)", dark: "var(--color-champagne)", print: "#CDB891" },
  { x: 54, top: 35, bottom: 86, light: "var(--color-sand)", dark: "#8A8377", print: "#E7E1D6" },
] as const;

export type Panel = (typeof PANELS)[number];

export const MARK_VIEWBOX = { width: 76, height: 106 } as const;
export const PANEL_WIDTH = 22;
/** Vertical shear across each panel's width — what reads as perspective. */
export const SHEAR = 6;
/** The lit edge down the right of each panel, as in the reference artwork. */
export const RIM = 2.4;

/** Champagne rim separates each panel from the one behind it and keeps the lightest panel visible on an ivory ground. */
export function rimColor(panel: Panel, medium: "css" | "print"): string {
  if (panel.x >= 36) return "#A8863F";
  return medium === "css" ? "var(--color-champagne)" : "#CDB891";
}

/** A panel's outline, clockwise from its upper-left corner. */
export function panelPoints(panel: Panel): Point[] {
  const x2 = panel.x + PANEL_WIDTH;
  return [[panel.x, panel.top], [x2, panel.top + SHEAR], [x2, panel.bottom + SHEAR], [panel.x, panel.bottom]];
}

/** The rim strip down a panel's right edge. */
export function rimPoints(panel: Panel): Point[] {
  const x2 = panel.x + PANEL_WIDTH;
  const rimX = x2 - RIM;
  const drop = (RIM * SHEAR) / PANEL_WIDTH;
  return [[rimX, panel.top + SHEAR - drop], [x2, panel.top + SHEAR], [x2, panel.bottom + SHEAR], [rimX, panel.bottom + SHEAR - drop]];
}

/** An SVG path through the points, closed. */
export function pathData(points: Point[]): string {
  return [...points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`), "Z"].join(" ");
}

/**
 * The lockup in em of PREMIER's font size, as the website's CSS sets it: the mark 2.05em tall beside the
 * wordmark, 0.5em apart; PREMIER tracked 0.24em; 0.28em below it the sub-row, a 0.9em rule, 0.4em gap,
 * SHADE SOLUTIONS at 0.33em tracked 0.28 of its own size, 0.4em gap, and a rule to the column's end.
 * Tailwind needs literal classes, so Logo.tsx repeats these as h-[2.05em] etc.; tests/brand/logo.test.tsx keeps the two equal.
 */
export const LOCKUP = {
  markHeight: 2.05, gap: 0.5, premierTracking: 0.24, subTop: 0.28, subSize: 0.33, subTracking: 0.28,
  ruleLead: 0.9, ruleGap: 0.4, ruleThickness: 1 / 26, ruleOpacity: 0.8,
  premierWeight: 300, subWeight: 400, ink: "#1E1E1E", accent: "#766028",
} as const;
