import { describe, it, expect } from "vitest";
import { STAGES, ALL_STAGES, isStage, stageLabel, nextStage, WORKING_STAGES, STAGE_STYLE, parseWorkingStage, BOARD_STAGES, INSTALLED_STATUSES, isInstalled, LIST_FILTERS, parseListFilter, stageIndex, BOOKED_OR_LATER, SOLD_OR_LATER } from "@/lib/admin/stages";

describe("stages", () => {
  it("runs from new lead to completed, in order", () => {
    expect(STAGES.map((s) => s.value)).toEqual([
      "new", "visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed",
    ]);
  });

  it("includes lost as a stage but not in the active sequence", () => {
    expect(ALL_STAGES).toContain("lost");
    expect(STAGES.map((s) => s.value)).not.toContain("lost");
  });

  it("advances one stage at a time and stops at completed", () => {
    expect(nextStage("new")).toBe("visit_booked");
    expect(nextStage("quoted")).toBe("approved");
    expect(nextStage("signed")).toBe("sold");
    expect(nextStage("sold")).toBe("measure");
    expect(nextStage("measure")).toBe("ordered");
    expect(nextStage("ordered")).toBe("installed");
    expect(nextStage("installed")).toBe("completed");
    expect(nextStage("completed")).toBeNull();
    expect(nextStage("lost")).toBeNull();
  });

  it("labels stages the way the owners read them", () => {
    expect(stageLabel("new")).toBe("New lead");
    expect(stageLabel("visit_booked")).toBe("Appointment booked");
    expect(stageLabel("approved")).toBe("Approved");
    expect(stageLabel("signed")).toBe("Signed");
    expect(stageLabel("measure")).toBe("Official measure");
    expect(stageLabel("completed")).toBe("Completed");
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
  it("lists the working stages in stage order", () => {
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

describe("board and installed stages", () => {
  it("puts only current work on the board", () => {
    expect([...BOARD_STAGES]).toEqual(["new", "visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed"]);
  });

  it("counts installed and completed as installed", () => {
    expect([...INSTALLED_STATUSES]).toEqual(["installed", "completed"]);
    expect(isInstalled("installed")).toBe(true);
    expect(isInstalled("completed")).toBe(true);
    expect(isInstalled("ordered")).toBe(false);
    expect(isInstalled("lost")).toBe(false);
  });

  it("styles completed with its own token", () => {
    expect(STAGE_STYLE.completed).toEqual({
      icon: "check", edge: "border-t-stage-completed", tint: "text-stage-completed", left: "border-l-stage-completed",
    });
  });
});

describe("job list filter", () => {
  it("offers all jobs, every stage in order, then lost", () => {
    expect(LIST_FILTERS.map((f) => f.label)).toEqual([
      "All jobs", "New lead", "Appointment booked", "Quoted", "Approved", "Signed", "Sold", "Official measure", "Ordered", "Installed", "Completed", "Lost",
    ]);
    expect(LIST_FILTERS[0].value).toBe("");
  });

  it("reads a stage from the URL and treats anything else as all jobs", () => {
    expect(parseListFilter("completed")).toBe("completed");
    expect(parseListFilter("lost")).toBe("lost");
    expect(parseListFilter("nope")).toBeNull();
    expect(parseListFilter(undefined)).toBeNull();
  });
});

describe("stage order helpers", () => {
  it("gives each stage its place and lost none", () => {
    expect(stageIndex("new")).toBe(0);
    expect(stageIndex("signed")).toBeLessThan(stageIndex("sold"));
    expect(stageIndex("measure")).toBeLessThan(stageIndex("ordered"));
    expect(stageIndex("lost")).toBe(-1);
  });

  it("counts a job booked from Appointment booked on, and sold only from Sold on (Signed is not yet a sale)", () => {
    expect([...BOOKED_OR_LATER]).toEqual(["visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed"]);
    expect([...SOLD_OR_LATER]).toEqual(["sold", "measure", "ordered", "installed", "completed"]);
  });

  it("styles the three new stages with their own tokens", () => {
    expect(STAGE_STYLE.approved.edge).toBe("border-t-stage-approved");
    expect(STAGE_STYLE.signed.tint).toBe("text-stage-signed");
    expect(STAGE_STYLE.measure.left).toBe("border-l-stage-measure");
  });
});
