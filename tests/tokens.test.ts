import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

describe("brand tokens", () => {
  const palette = {
    charcoal: "#1E1E1E",
    taupe: "#7A7263",
    champagne: "#CDB891",
    sand: "#E7E1D6",
    ivory: "#F7F5F0",
  };

  for (const [name, hex] of Object.entries(palette)) {
    it(`defines --color-${name} as ${hex}`, () => {
      expect(css).toContain(`--color-${name}: ${hex}`);
    });
  }

  it("provides an AA-safe champagne for type", () => {
    expect(css).toContain("--color-champagne-ink");
  });

  it("declares both brand font families", () => {
    expect(css).toContain("--font-display");
    expect(css).toContain("--font-body");
  });

  it("respects prefers-reduced-motion", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
});
