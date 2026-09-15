import { describe, it, expect } from "vitest";
import { TREATMENT_TYPE_KEYS, isTreatmentType, treatmentTypeLabels } from "@/lib/leads/treatment-types";
import { WINDOW_EXACT_OPTIONS, windowCountLabel, windowsPhrase } from "@/lib/leads/window-count";
import { FINISH_OPTIONS, finishBudgetLabel, tierForFinish } from "@/lib/leads/finish";

describe("treatment types", () => {
  it("are the eight keys in order", () => {
    expect(TREATMENT_TYPE_KEYS).toEqual(["horizontal_blinds", "vertical_blinds", "shutters", "cellular_shades",
      "roller_shades", "roman_shades", "sheer_shadings", "not_sure"]);
  });
  it("label keys in list order and skip unknown ones", () => {
    expect(treatmentTypeLabels(["cellular_shades", "shutters", "curtains"])).toEqual(["Shutters", "Cellular shades"]);
    expect(treatmentTypeLabels(["not_sure", "sheer_shadings"])).toEqual(["Sheer horizontal shadings", "Not sure — show me all the samples"]);
  });
  it("recognise only the keys", () => {
    expect(isTreatmentType("roman_shades")).toBe(true);
    expect(isTreatmentType("Roman shades")).toBe(false);
  });
});

describe("exact window count", () => {
  it("offers 1 to 30 and 30+", () => {
    expect(WINDOW_EXACT_OPTIONS).toHaveLength(31);
    expect(WINDOW_EXACT_OPTIONS[0]).toEqual({ value: "1", label: "1" });
    expect(WINDOW_EXACT_OPTIONS[30]).toEqual({ value: "31", label: "30+" });
  });
  it("labels counts", () => {
    expect(windowCountLabel(12)).toBe("12");
    expect(windowCountLabel(31)).toBe("30+");
    expect(windowsPhrase(1)).toBe("1 window");
    expect(windowsPhrase(12)).toBe("12 windows");
    expect(windowsPhrase(31)).toBe("30+ windows");
  });
});

describe("finish", () => {
  it("maps to budget tiers, with not sure leaving the tier alone", () => {
    expect(tierForFinish("essential")).toBe("value");
    expect(tierForFinish("designer")).toBe("mid");
    expect(tierForFinish("luxury")).toBe("premium");
    expect(tierForFinish("not_sure")).toBeNull();
    expect(tierForFinish(null)).toBeNull();
  });
  it("has the customer-facing copy", () => {
    expect(FINISH_OPTIONS.map((o) => `${o.label}${o.description ? ` — ${o.description}` : ""}`)).toEqual([
      "Essential — clean, durable, great value",
      "Designer — more fabrics and colors, upgraded features",
      "Luxury — top-tier fabrics and premium brands",
      "Not sure yet",
    ]);
  });
  it("shows the customer's finish beside the tier only while they still match", () => {
    expect(finishBudgetLabel("luxury", "premium")).toBe("Luxury → Premium");
    expect(finishBudgetLabel("luxury", "mid")).toBe("Mid-range");
    expect(finishBudgetLabel("not_sure", "mid")).toBe("Mid-range");
    expect(finishBudgetLabel(null, null)).toBe("—");
  });
});
