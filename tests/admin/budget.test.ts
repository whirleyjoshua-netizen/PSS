import { describe, it, expect } from "vitest";
import { BUDGET_OPTIONS, BUDGET_TIERS, budgetLabel, isBudgetTier } from "@/lib/admin/budget";

describe("budget tiers", () => {
  it("are value, mid and premium", () => {
    expect(BUDGET_TIERS).toEqual(["value", "mid", "premium"]);
  });
  it("label each tier and show a dash for none", () => {
    expect(budgetLabel("value")).toBe("Value");
    expect(budgetLabel("mid")).toBe("Mid-range");
    expect(budgetLabel("premium")).toBe("Premium");
    expect(budgetLabel(null)).toBe("—");
    expect(budgetLabel(undefined)).toBe("—");
  });
  it("offer options in order", () => {
    expect(BUDGET_OPTIONS).toEqual([
      { value: "value", label: "Value" },
      { value: "mid", label: "Mid-range" },
      { value: "premium", label: "Premium" },
    ]);
  });
  it("recognise only known tiers", () => {
    expect(isBudgetTier("mid")).toBe(true);
    expect(isBudgetTier("luxury")).toBe(false);
    expect(isBudgetTier(null)).toBe(false);
  });
});
