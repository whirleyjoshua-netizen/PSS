import { describe, it, expect } from "vitest";
import { isEmptyAnswers, questionnaireSchema } from "@/lib/leads/questionnaire-schema";
import { questionnaireSummary } from "@/lib/leads/questionnaire-summary";

const empty = { windowCountExact: "", treatmentTypes: [], motorized: false, address: "", gateCode: "", finish: "" };

describe("questionnaireSchema", () => {
  it("parses a full answer set", () => {
    expect(questionnaireSchema.parse({
      windowCountExact: "12", treatmentTypes: ["shutters", "cellular_shades", "shutters"], motorized: true,
      address: " 12 Sample St ", gateCode: " #4321 ", finish: "luxury",
    })).toEqual({
      windowCountExact: 12, treatmentTypes: ["shutters", "cellular_shades"], motorized: true,
      address: "12 Sample St", gateCode: "#4321", finish: "luxury",
    });
  });
  it("turns an empty submit into empty answers", () => {
    const parsed = questionnaireSchema.parse(empty);
    expect(parsed).toEqual({ windowCountExact: null, treatmentTypes: [], motorized: false, address: null, gateCode: null, finish: null });
    expect(isEmptyAnswers(parsed)).toBe(true);
    expect(isEmptyAnswers({ ...parsed, motorized: true })).toBe(false);
  });
  it("accepts 1 to 31 windows only", () => {
    expect(questionnaireSchema.parse({ ...empty, windowCountExact: "31" }).windowCountExact).toBe(31);
    for (const bad of ["0", "32", "2.5", "lots"]) {
      expect(questionnaireSchema.safeParse({ ...empty, windowCountExact: bad }).error!.issues[0].message).toBe("Pick how many windows");
    }
  });
  it("rejects unknown treatment types and finishes", () => {
    expect(questionnaireSchema.safeParse({ ...empty, treatmentTypes: ["curtains"] }).error!.issues[0].message).toBe("Pick from the listed treatments");
    expect(questionnaireSchema.safeParse({ ...empty, finish: "premium" }).error!.issues[0].message).toBe("Pick a finish");
  });
  it("limits the gate code to 40 characters and the address to 200", () => {
    expect(questionnaireSchema.safeParse({ ...empty, gateCode: "x".repeat(41) }).error!.issues[0].message).toBe("Keep the gate code under 40 characters");
    expect(questionnaireSchema.safeParse({ ...empty, gateCode: "x".repeat(40) }).success).toBe(true);
    expect(questionnaireSchema.safeParse({ ...empty, address: "x".repeat(201) }).success).toBe(false);
  });
});

describe("questionnaireSummary", () => {
  const base = { windowCountExact: null, treatmentTypes: [], motorized: false, address: null, gateCode: null, finish: null } as const;
  it("lists what the customer told us, without the gate code or address", () => {
    expect(questionnaireSummary({ ...base, windowCountExact: 12, treatmentTypes: ["cellular_shades", "shutters"], motorized: true,
      finish: "luxury", gateCode: "#4321", address: "12 Sample St" }))
      .toBe("Customer added details: 12 windows · Shutters, Cellular shades · Motorized · Luxury");
  });
  it("leaves out empty parts", () => {
    expect(questionnaireSummary({ ...base, windowCountExact: 31 })).toBe("Customer added details: 30+ windows");
    expect(questionnaireSummary({ ...base, finish: "not_sure" })).toBe("Customer added details: Finish not sure yet");
    expect(questionnaireSummary({ ...base, gateCode: "#4321" })).toBe("Customer added details");
  });
});
