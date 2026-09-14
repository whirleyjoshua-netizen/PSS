/** The budget tier the owner hears on the first call. Owner-only; never shown to customers. */
export const BUDGET_TIERS = ["value", "mid", "premium"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

const LABELS: Record<BudgetTier, string> = { value: "Value", mid: "Mid-range", premium: "Premium" };

export const isBudgetTier = (value: unknown): value is BudgetTier =>
  typeof value === "string" && (BUDGET_TIERS as readonly string[]).includes(value);

export const budgetLabel = (tier: BudgetTier | null | undefined): string => (tier ? LABELS[tier] : "—");

export const BUDGET_OPTIONS = BUDGET_TIERS.map((value) => ({ value, label: LABELS[value] }));
