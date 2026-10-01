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
});
