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
