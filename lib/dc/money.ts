/**
 * "1,619.00" → 161900. "(10.00)" and "-10.00" are negative (a promotion). Exactly two decimals
 * or null: a Dealer Copy always prints cents, so anything else means the format changed.
 * Digits are joined as strings, never multiplied as floats.
 */
export function parseMoney(text: string): number | null {
  const trimmed = text.replace(/[\s $]/g, "");
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
  const bare = trimmed.replace(/^\(|\)$/g, "").replace(/^-/, "").replace(/,/g, "");
  const match = /^(\d+)\.(\d{2})$/.exec(bare);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number(match[2]);
  return negative ? -cents : cents;
}

/** 57.3 → 5730. Percentages carry at most two decimals (numeric(6,2)). */
export const pctToBasisPoints = (pct: number): number => Math.round(pct * 100);

/** round-half-up(msrp × pct / 100), in integer arithmetic. */
export function sellUnitCents(msrpUnitCents: number, pct: number): number {
  return Math.floor((msrpUnitCents * pctToBasisPoints(pct) + 5000) / 10000);
}
