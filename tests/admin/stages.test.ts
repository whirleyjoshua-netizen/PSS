import { describe, it, expect } from "vitest";
import { STAGES, ALL_STAGES, isStage, stageLabel, nextStage } from "@/lib/admin/stages";

describe("stages", () => {
  it("runs from new lead to installed, in order", () => {
    expect(STAGES.map((s) => s.value)).toEqual([
      "new", "contacted", "visit_booked", "quoted", "sold", "ordered", "installed",
    ]);
  });

  it("includes lost as a stage but not in the active sequence", () => {
    expect(ALL_STAGES).toContain("lost");
    expect(STAGES.map((s) => s.value)).not.toContain("lost");
  });

  it("advances one stage at a time and stops at installed", () => {
    expect(nextStage("new")).toBe("contacted");
    expect(nextStage("ordered")).toBe("installed");
    expect(nextStage("installed")).toBeNull();
    expect(nextStage("lost")).toBeNull();
  });

  it("labels stages the way the owners read them", () => {
    expect(stageLabel("new")).toBe("New lead");
    expect(stageLabel("visit_booked")).toBe("Visit booked");
    expect(stageLabel("lost")).toBe("Lost");
  });

  it("rejects anything that is not a stage", () => {
    expect(isStage("sold")).toBe(true);
    expect(isStage("Sold")).toBe(false);
    expect(isStage(undefined)).toBe(false);
  });
});
