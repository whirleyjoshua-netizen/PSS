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
    for (const cls of [`h-[${LOCKUP.markHeight}em]`, `gap-[${LOCKUP.gap}em]`, `mt-[${LOCKUP.subTop}em]`, `w-[${LOCKUP.ruleLead}em]`, `gap-[${LOCKUP.ruleGap}em]`, "opacity-80"]) {
      expect(source).toContain(cls);
    }
    expect(LOCKUP.ruleOpacity).toBe(0.8);
  });
});
