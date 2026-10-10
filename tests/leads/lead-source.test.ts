import { describe, it, expect } from "vitest";
import { consultationSchema, LEAD_SOURCES } from "@/lib/leads/schema";

const base = { name: "Dana Reyes", phone: "7025550134", email: "dana@example.com", city: "Henderson" };

describe("lead sources", () => {
  it("accepts a lead from the booking block", () => {
    const parsed = consultationSchema.safeParse({ ...base, source: "booking" });
    expect(parsed.success).toBe(true);
  });

  it("still refuses an unknown source", () => {
    expect(consultationSchema.safeParse({ ...base, source: "popup" }).success).toBe(false);
  });

  it("lists exactly the four public forms (the holiday page joined 2026-10-10)", () => {
    expect(LEAD_SOURCES).toEqual(["hero", "contact", "booking", "holiday"]);
  });
});
