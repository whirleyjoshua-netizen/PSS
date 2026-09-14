import { describe, it, expect } from "vitest";
import { formatCallVisit } from "@/lib/admin/time";

describe("formatCallVisit", () => {
  it("formats a Las Vegas visit time in summer and winter", () => {
    expect(formatCallVisit(new Date("2026-10-14T21:00:00Z"))).toBe("Wed 10/14, 2:00 PM");
    expect(formatCallVisit(new Date("2026-12-01T22:30:00Z"))).toBe("Tue 12/1, 2:30 PM");
  });
});
