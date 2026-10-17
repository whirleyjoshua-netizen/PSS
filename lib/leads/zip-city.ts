import type { LeadCity } from "@/content/business";

const HENDERSON = new Set(["89002", "89011", "89012", "89014", "89015", "89044", "89052", "89074"]);
const NORTH_LAS_VEGAS = new Set(["89030", "89031", "89032", "89081", "89084", "89085", "89086"]);
const SUMMERLIN = new Set(["89134", "89135", "89138", "89144", "89145"]);
const PAHRUMP = new Set(["89041", "89048", "89060", "89061"]);
const MESQUITE = new Set(["89024", "89027"]);

/**
 * The service-area city for a ZIP, or null when the ZIP is blank, malformed
 * or outside the service area (the caller then uses "Las Vegas" and notes it).
 * A ZIP+4 such as "89052-1234" is read by its first five digits.
 */
export function cityForZip(zip: string | null | undefined): LeadCity | null {
  const match = /^(\d{5})(?!\d)/.exec((zip ?? "").trim());
  if (!match) return null;
  const five = match[1];
  if (HENDERSON.has(five)) return "Henderson";
  if (NORTH_LAS_VEGAS.has(five)) return "North Las Vegas";
  if (SUMMERLIN.has(five)) return "Summerlin";
  if (PAHRUMP.has(five)) return "Pahrump";
  if (MESQUITE.has(five)) return "Mesquite";
  const n = Number(five);
  if (n >= 89101 && n <= 89199) return "Las Vegas";
  return null;
}
