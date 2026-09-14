const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** The `integer` column's max value in cents (21,474,836.47 dollars). */
const MAX_CENTS = 2_147_483_647;

/** "$4,500.50" → 450050. Blank means "not set". */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!AMOUNT.test(cleaned)) throw new Error("Enter an amount like 4500 or 4,500.00");
  const cents = Math.round(Number(cleaned) * 100);
  if (cents > MAX_CENTS) throw new Error("Enter an amount under $21,474,836");
  return cents;
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/** What the customer still owes: sold minus deposit, or null before there is a sale. */
export const balanceCents = (sold: number | null, deposit: number | null): number | null =>
  sold === null ? null : sold - (deposit ?? 0);
