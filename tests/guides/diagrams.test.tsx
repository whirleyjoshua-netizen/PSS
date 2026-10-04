import { render } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DIAGRAM_IDS } from "@/content/guides";
import { DIAGRAMS, Diagram } from "@/components/guides/diagrams";

const svgOf = (id: (typeof DIAGRAM_IDS)[number]) =>
  render(<Diagram id={id} />).container.querySelector("svg")!;

describe("guide diagrams", () => {
  it("has exactly one entry per diagram id", () => {
    expect(Object.keys(DIAGRAMS).sort()).toEqual([...DIAGRAM_IDS].sort());
  });

  it.each([...DIAGRAM_IDS])("%s is a labelled image", (id) => {
    const svg = svgOf(id);
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe(DIAGRAMS[id].label);
    expect(DIAGRAMS[id].label.length).toBeGreaterThan(15);
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
  });

  // Reduced motion leaves only the attributes on screen, so they must show the instructive pose.
  it("draws the end pose in attributes", () => {
    expect(svgOf("cellular-lower").querySelector("[data-part=fabric]")!.getAttribute("height")).toBe("150");
    expect(svgOf("cellular-raise").querySelector("[data-part=fabric]")!.getAttribute("height")).toBe("45");
    expect(svgOf("cellular-pull-45").querySelector("[data-part=pose]")!.getAttribute("transform")).toBe("rotate(-45 62 24)");
    expect(svgOf("cellular-tug").querySelector("[data-part=pose]")!.getAttribute("transform")).toBe("rotate(-45 62 24)");
    expect([...svgOf("slat-plugs").querySelectorAll("[data-part=plug]")].map((p) => p.getAttribute("y"))).toEqual(["182", "182"]);
    expect([...svgOf("slat-cord-up").querySelectorAll("[data-part=cord]")].map((c) => c.getAttribute("y2"))).toEqual(["80", "80"]);
    expect(svgOf("slat-swap").querySelector("[data-part=old-slat]")!.getAttribute("opacity")).toBe("0");
    expect([...svgOf("slat-reknot").querySelectorAll("[data-part=plug]")].map((p) => p.getAttribute("y"))).toEqual(["168", "168"]);
  });

  it("gives every pleat pattern its own id, and each fabric points at an existing pattern", () => {
    const { container } = render(
      <>
        <Diagram id="cellular-lower" />
        <Diagram id="cellular-raise" />
      </>,
    );
    const ids = [...container.querySelectorAll("pattern")].map((p) => p.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const fabric of container.querySelectorAll("[data-part=fabric]")) {
      const ref = fabric.getAttribute("fill")!.match(/^url\(#(.+)\)$/)![1];
      expect(ids).toContain(ref);
    }
  });

  it("defines in globals.css every guide- animation class the diagrams use", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const used = new Set<string>();
    for (const id of DIAGRAM_IDS) {
      for (const el of svgOf(id).querySelectorAll("[class]")) {
        for (const cls of (el.getAttribute("class") ?? "").split(/\s+/)) if (cls.startsWith("guide-")) used.add(cls);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const cls of used) expect(css, cls).toContain(`.${cls}`);
  });

  it("uses no color literals in guide components", () => {
    const dir = "components/guides";
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const file of walk(dir)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });
});
