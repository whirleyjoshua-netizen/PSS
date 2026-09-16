/** The customer-facing project number. Internal ids never reach the portal. */
export const formatProjectNo = (n: number | null | undefined): string | null =>
  typeof n === "number" ? `PSS-${String(n).padStart(4, "0")}` : null;
