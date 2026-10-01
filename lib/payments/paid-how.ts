import type { DepositMethod } from "./deposits";

/**
 * How a deposit was paid, as a sentence ends: "$924.17 by card". One copy, shared by the receipts
 * (server) and the Quote tab's deposit panel (client), so this module is plain — not server-only.
 */
export const PAID_HOW: Record<DepositMethod, string> = { stripe: "by card", check: "by check", cash: "in cash", other: "by other means" };
