import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Section } from "@/components/ui/Section";

describe("Section", () => {
  it("keeps the usual vertical spacing by default", () => {
    const { container } = render(<Section>Body</Section>);
    const classes = container.querySelector("section")!.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["py-20", "md:py-28"]));
    expect(classes).not.toContain("pt-4");
  });

  it("tightens only the phone top padding when asked", () => {
    const { container } = render(<Section padding="tight-top">Body</Section>);
    const classes = container.querySelector("section")!.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["pt-4", "pb-20", "md:py-28"]));
    expect(classes).not.toContain("py-20");
  });
});
