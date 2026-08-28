import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { business } from "@/content/business";

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (["node_modules", ".next", ".git"].includes(entry)) return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("business content", () => {
  it("uses the exact approved tagline", () => {
    expect(business.tagline).toBe("Control the Light. Define the Space.");
  });

  it("uses the exact approved business name", () => {
    expect(business.name).toBe("Premier Shade Solutions");
  });

  it("covers the four service-area cities in order", () => {
    expect(business.serviceArea).toEqual([
      "Las Vegas",
      "Henderson",
      "Summerlin",
      "North Las Vegas",
    ]);
  });

  /**
   * Guard, not a feature test. If someone hardcodes the phone number into a
   * component, swapping in the real number stops being a one-line change.
   * This is expected to start failing the moment that happens.
   */
  it("has no phone number hardcoded outside content/business.ts", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap((dir) => walk(dir))
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => /\(\d{3}\)\s?\d{3}-\d{4}|tel:\+1\d{10}/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("flags the placeholders so launch-day swaps are findable", () => {
    expect(business.phone.isPlaceholder).toBe(true);
    expect(business.emailIsPlaceholder).toBe(true);
    expect(business.address.isPlaceholder).toBe(true);
  });
});
