import { budgetLabel, type BudgetTier } from "@/lib/admin/budget";

/** The customer's words for the budget tiers. Never money, never brands. */
export const FINISHES = ["essential", "designer", "luxury", "not_sure"] as const;
export type Finish = (typeof FINISHES)[number];

export const FINISH_OPTIONS: { value: Finish; label: string; description: string }[] = [
  { value: "essential", label: "Essential", description: "clean, durable, great value" },
  { value: "designer", label: "Designer", description: "more fabrics and colors, upgraded features" },
  { value: "luxury", label: "Luxury", description: "top-tier fabrics and premium brands" },
  { value: "not_sure", label: "Not sure yet", description: "" },
];

const TIERS: Record<Exclude<Finish, "not_sure">, BudgetTier> = { essential: "value", designer: "mid", luxury: "premium" };

export const isFinish = (value: unknown): value is Finish =>
  typeof value === "string" && (FINISHES as readonly string[]).includes(value);

export const finishLabel = (finish: Finish): string => FINISH_OPTIONS.find((option) => option.value === finish)!.label;

/** The budget tier a finish stands for. "Not sure" leaves the tier as it is. */
export const tierForFinish = (finish: Finish | null | undefined): BudgetTier | null =>
  finish && finish !== "not_sure" ? TIERS[finish] : null;

/** "Luxury → Premium" while the tier is still the customer's pick; otherwise just the tier. */
export function finishBudgetLabel(finish: Finish | null | undefined, tier: BudgetTier | null | undefined): string {
  if (tier && tierForFinish(finish) === tier) return `${finishLabel(finish!)} → ${budgetLabel(tier)}`;
  return budgetLabel(tier);
}
