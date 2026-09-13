/**
 * Window dimensions are whole eighths of an inch, stored as one integer so
 * 35 5/8" is exactly 285 — no floating-point rounding anywhere.
 */
export const MAX_EIGHTHS = 600 * 8;

const GLYPHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"] as const;

export const EIGHTH_OPTIONS = GLYPHS.map((glyph, value) => ({ value, label: glyph || "0" }));

export const toEighths = (inches: number, eighth: number): number => inches * 8 + eighth;

export const splitEighths = (total: number) => ({ inches: Math.floor(total / 8), eighth: total % 8 });

export function formatEighths(total: number | null): string {
  if (total === null) return "—";
  const { inches, eighth } = splitEighths(total);
  if (!eighth) return `${inches}″`;
  return inches ? `${inches} ${GLYPHS[eighth]}″` : `${GLYPHS[eighth]}″`;
}

export const ROOMS = [
  "Living room", "Family room", "Kitchen", "Dining room", "Primary bedroom",
  "Bedroom", "Bathroom", "Office", "Patio",
] as const;

export const REQUIREMENTS = [
  { value: "hard_surface", label: "Hard surface" },
  { value: "high_ladder", label: "High ladder" },
] as const;

export type Requirement = (typeof REQUIREMENTS)[number]["value"];

export const requirementLabel = (value: string): string =>
  REQUIREMENTS.find((r) => r.value === value)?.label ?? value;
