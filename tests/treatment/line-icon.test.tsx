import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LineIcon, ICON_PATHS } from "@/components/ui/LineIcon";
import { categories, type HighlightIcon } from "@/content/products";

describe("LineIcon", () => {
  it("draws every icon a category uses", () => {
    const used = new Set(categories.flatMap((c) => c.highlights.map((h) => h.icon)));
    for (const name of used) expect(ICON_PATHS[name]?.length ?? 0).toBeGreaterThan(0);
  });

  it("is decorative: hidden from screen readers, stroked in the theme's ink", () => {
    const { container } = render(<LineIcon name={"sun" as HighlightIcon} className="size-7" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("class")).toContain("stroke-champagne-ink");
    expect(svg.getAttribute("class")).toContain("size-7");
    expect(svg.querySelectorAll("path")).toHaveLength(ICON_PATHS.sun.length);
  });

  it("closes the leaf outline back where it starts", () => {
    // "M x y c …": a move, then relative cubic curves of six numbers each.
    const [x, y, ...curves] = ICON_PATHS.leaf[0].match(/-?\d+(\.\d+)?/g)!.map(Number);
    let end = [x, y];
    for (let i = 0; i < curves.length; i += 6) end = [end[0] + curves[i + 4], end[1] + curves[i + 5]];
    expect(end).toEqual([x, y]);
  });
});
