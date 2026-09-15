import { describe, it, expect } from "vitest";
import { STAGES, ALL_STAGES, isStage, stageLabel, nextStage, WORKING_STAGES, STAGE_STYLE, parseWorkingStage } from "@/lib/admin/stages";

describe("stages", () => {
  it("runs from new lead to installed, in order", () => {
    expect(STAGES.map((s) => s.value)).toEqual([
      "new", "visit_booked", "quoted", "sold", "ordered", "installed",
    ]);
  });

  it("includes lost as a stage but not in the active sequence", () => {
    expect(ALL_STAGES).toContain("lost");
    expect(STAGES.map((s) => s.value)).not.toContain("lost");
  });

  it("advances one stage at a time and stops at installed", () => {
    expect(nextStage("new")).toBe("visit_booked");
    expect(nextStage("ordered")).toBe("installed");
    expect(nextStage("installed")).toBeNull();
    expect(nextStage("lost")).toBeNull();
  });

  it("labels stages the way the owners read them", () => {
    expect(stageLabel("new")).toBe("New lead");
    expect(stageLabel("visit_booked")).toBe("Appointment booked");
    expect(stageLabel("lost")).toBe("Lost");
  });

  it("rejects anything that is not a stage", () => {
    expect(isStage("sold")).toBe(true);
    expect(isStage("Sold")).toBe(false);
    expect(isStage(undefined)).toBe(false);
  });

  it("still names the retired Contacted stage for old activity", () => {
    expect(stageLabel("contacted")).toBe("Contacted");
    expect(isStage("contacted")).toBe(false);
  });
});

describe("working stages and styles", () => {
  it("lists the six working stages in board order", () => {
    expect([...WORKING_STAGES]).toEqual(STAGES.map((s) => s.value));
  });

  it("parses only working stages", () => {
    expect(parseWorkingStage("quoted")).toBe("quoted");
    expect(parseWorkingStage("lost")).toBeNull();
    expect(parseWorkingStage("nope")).toBeNull();
    expect(parseWorkingStage(undefined)).toBeNull();
  });

  it("gives every stage an icon and literal color classes", () => {
    for (const stage of ALL_STAGES) {
      const style = STAGE_STYLE[stage];
      expect(style.icon).toBeTruthy();
      expect(style.edge).toMatch(/^border-t-/);
      expect(style.tint).toMatch(/^text-/);
      expect(style.left).toMatch(/^border-l-/);
    }
    expect(STAGE_STYLE.quoted.edge).toBe("border-t-stage-quoted");
  });
});
