/**
 * What the customer (questionnaire) or the owners (call screen, Job details) say the
 * customer wants. Keys are stored; labels are shown. Separate from the website form's
 * broad categories in `treatments`.
 */
export const TREATMENT_TYPES = [
  { key: "horizontal_blinds", label: "Horizontal blinds" },
  { key: "vertical_blinds", label: "Vertical blinds" },
  { key: "shutters", label: "Shutters" },
  { key: "cellular_shades", label: "Cellular shades" },
  { key: "roller_shades", label: "Roller shades" },
  { key: "roman_shades", label: "Roman shades" },
  { key: "sheer_shadings", label: "Sheer horizontal shadings" },
  { key: "not_sure", label: "Not sure — show me all the samples" },
] as const;

export type TreatmentType = (typeof TREATMENT_TYPES)[number]["key"];

export const TREATMENT_TYPE_KEYS = TREATMENT_TYPES.map((type) => type.key) as [TreatmentType, ...TreatmentType[]];

export const isTreatmentType = (value: unknown): value is TreatmentType =>
  typeof value === "string" && (TREATMENT_TYPE_KEYS as readonly string[]).includes(value);

/** Labels in the list's order, whatever order the keys came in. Unknown keys are skipped. */
export const treatmentTypeLabels = (keys: readonly string[]): string[] =>
  TREATMENT_TYPES.filter((type) => keys.includes(type.key)).map((type) => type.label);
