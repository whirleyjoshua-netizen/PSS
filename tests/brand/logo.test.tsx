import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "@/components/brand/Logo";

/** Every shape the website draws, so moving the geometry can't change the site's logo. */
const shapes = (container: HTMLElement) =>
  [...container.querySelectorAll("svg")].map((svg) => ({
    viewBox: svg.getAttribute("viewBox"),
    paths: [...svg.querySelectorAll("path")].map((p) => [p.getAttribute("d"), p.getAttribute("fill")]),
  }));

describe("Logo", () => {
  it.each([["lockup", "light"], ["mark", "dark"], ["stacked", "light"], ["lockup", "dark"]] as const)("draws the %s (%s) exactly as before", (variant, tone) => {
    const { container } = render(<Logo variant={variant} tone={tone} />);
    expect(shapes(container)).toMatchSnapshot();
  });
});

describe("Logo lockup proportions", () => {
  it("the website's Tailwind classes are the print master's LOCKUP ratios", async () => {
    const { readFileSync } = await import("node:fs");
    const { LOCKUP } = await import("@/lib/brand/logo-geometry");
    const source = readFileSync("components/brand/Logo.tsx", "utf8");
    // Each class in the element that carries it, so the stacked variant's own gap can't stand in for the lockup's.
    for (const cls of [
      `flex items-center gap-[${LOCKUP.gap}em]`, `className="h-[${LOCKUP.markHeight}em] w-auto shrink-0"`,
      `mt-[${LOCKUP.subTop}em] flex items-center gap-[${LOCKUP.ruleGap}em]`, `h-px w-[${LOCKUP.ruleLead}em] \${rule} opacity-80`,
    ]) {
      expect(source).toContain(cls);
    }
    expect(LOCKUP.ruleOpacity).toBe(0.8);
  });

  it("prints the website's own colours", async () => {
    const { readFileSync } = await import("node:fs");
    const { LOCKUP, PANELS } = await import("@/lib/brand/logo-geometry");
    const css = readFileSync("app/globals.css", "utf8");
    const token = (name: string) => new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)![1].toUpperCase();
    expect(PANELS.map((p) => p.print)).toEqual(["charcoal", "taupe", "champagne", "sand"].map(token));
    expect(PANELS.map((p) => p.light)).toEqual(["charcoal", "taupe", "champagne", "sand"].map((n) => `var(--color-${n})`));
    expect(LOCKUP.ink).toBe(token("charcoal"));
    expect(LOCKUP.accent).toBe(token("champagne-ink"));
  });
});
