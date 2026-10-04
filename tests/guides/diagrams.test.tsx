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
    const lower = svgOf("cellular-lower");
    expect(lower.querySelector("[data-part=fabric]")!.getAttribute("height")).toBe("150");
    expect(lower.querySelector("[data-part=rail]")!.getAttribute("y")).toBe("174");
    expect(lower.querySelector("[data-part=raise-pose]")).toBeNull();
    // Raised halfway: y' = 0.5y + 12 maps the 24→174 fabric onto 24→99, pleats stacked.
    const raise = svgOf("cellular-raise");
    expect(raise.querySelector("[data-part=raise-pose]")!.getAttribute("transform")).toBe("matrix(1 0 0 0.5 0 12)");
    expect(raise.querySelector("[data-part=raise-pose] > [data-part=fabric]")!.getAttribute("height")).toBe("150");
    expect(raise.querySelector("[data-part=rail]")!.getAttribute("y")).toBe("99");
    expect(svgOf("cellular-pull-45").querySelector("[data-part=pose]")!.getAttribute("transform")).toBe("rotate(-45 62 24)");
    expect(svgOf("cellular-tug").querySelector("[data-part=pose]")!.getAttribute("transform")).toBe("rotate(-45 62 24)");
    expect([...svgOf("slat-plugs").querySelectorAll("[data-part=plug]")].map((p) => p.getAttribute("y"))).toEqual(["182", "182"]);
    expect([...svgOf("slat-cord-up").querySelectorAll("[data-part=cord]")].map((c) => c.getAttribute("y2"))).toEqual(["80", "80"]);
    const oldSlat = svgOf("slat-swap").querySelector("[data-part=old-slat]")!;
    expect(oldSlat.getAttribute("opacity")).toBe("0");
    // The slat sliding out carries its crack, so it reads as the broken one.
    expect(oldSlat.tagName).toBe("g");
    expect(oldSlat.querySelector("rect")).not.toBeNull();
    expect(oldSlat.querySelector("path")).not.toBeNull();
    expect([...svgOf("slat-reknot").querySelectorAll("[data-part=plug]")].map((p) => p.getAttribute("y"))).toEqual(["168", "168"]);
    expect([...svgOf("slat-reknot").querySelectorAll("[data-part=cord]")].map((c) => c.getAttribute("y2"))).toEqual(["168", "168"]);
    expect([...svgOf("slat-reknot").querySelectorAll("[data-part=knot]")].map((k) => [k.getAttribute("cx"), k.getAttribute("cy")])).toEqual([
      ["66", "163"],
      ["134", "163"],
    ]);
  });

  // A gap in the stack reads as a missing slat; every step of the slat guide shows a full blind.
  it.each(["slat-plugs", "slat-cord-up", "slat-swap", "slat-reknot"] as const)("%s shows all 9 slats in its end pose", (id) => {
    const visible = [...svgOf(id).querySelectorAll("[data-part=slat]")].filter((s) => !s.closest('[opacity="0"]'));
    expect(visible.map((s) => Number(s.getAttribute("y"))).sort((a, b) => a - b)).toEqual([30, 44, 58, 72, 86, 100, 114, 128, 142]);
  });

  // The broken slat is two pieces with the right one hanging at the break, so it reads as cracked at phone size.
  it.each(["slat-plugs", "slat-cord-up"] as const)("%s draws the broken slat as two pieces", (id) => {
    const svg = svgOf(id);
    const left = [...svg.querySelectorAll("[data-part=slat]")].find((s) => s.getAttribute("y") === "86")!;
    expect([left.getAttribute("x"), left.getAttribute("width")]).toEqual(["32", "64"]);
    const right = svg.querySelector("[data-part=slat-break]")!;
    expect([right.getAttribute("x"), right.getAttribute("y"), right.getAttribute("width")]).toEqual(["102", "86", "66"]);
    expect(right.parentElement!.getAttribute("transform")).toBe("rotate(6 102 86)");
  });

  it("swaps out a slat drawn broken the same way", () => {
    const oldSlat = svgOf("slat-swap").querySelector("[data-part=old-slat]")!;
    expect(oldSlat.querySelector("[data-part=slat-break]")!.parentElement!.getAttribute("transform")).toBe("rotate(6 102 86)");
    expect(oldSlat.hasAttribute("transform")).toBe(false);
  });

  it("never puts a guide- animation class on an element with a transform attribute", () => {
    for (const id of DIAGRAM_IDS) {
      for (const el of svgOf(id).querySelectorAll("[transform]")) {
        expect(el.getAttribute("class") ?? "", `${id} ${el.outerHTML.slice(0, 60)}`).not.toMatch(/(^|\s)guide-/);
      }
    }
  });

  // The plugs rise from 182 to 168 (bottom edge 187 at the start), so the label sits below that travel.
  it("keeps the reknot label clear of the plugs' travel", () => {
    const label = svgOf("slat-reknot").querySelector("text")!;
    expect(Number(label.getAttribute("y")) - 9).toBeGreaterThan(187);
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
    for (const cls of used) {
      const rule = css.match(new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{([^}]*)\\}`));
      expect(rule, cls).not.toBeNull();
      const animation = rule![1].match(/animation:\s*([\w-]+)/);
      if (animation) expect(css, `@keyframes ${animation[1]}`).toMatch(new RegExp(`@keyframes ${animation[1]}(?![\\w-])`));
    }
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
