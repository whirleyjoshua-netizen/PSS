const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** "$4,500.50" → 450050. Blank means "not set". */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!AMOUNT.test(cleaned)) throw new Error("Enter an amount like 4500 or 4,500.00");
  return Math.round(Number(cleaned) * 100);
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}
