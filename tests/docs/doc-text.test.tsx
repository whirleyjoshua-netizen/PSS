import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocText } from "@/components/docs/DocText";
import type { Block, Inline } from "@/lib/docs/types";

const t = (text: string, bold = false): Inline => ({ type: "text", text, bold });

describe("DocText", () => {
  it("renders headings, paragraphs, bullets and bold", () => {
    const blocks: Block[] = [
      { type: "heading", level: 2, inlines: [t("Before we arrive")] },
      { type: "heading", level: 3, inlines: [t("Pets")] },
      { type: "paragraph", inlines: [t("Please "), t("move", true), t(" furniture.")] },
      { type: "bullets", items: [[t("Clear the sills")], [t("Unlock the gate")]] },
    ];
    const { container } = render(<DocText blocks={blocks} />);
    expect(screen.getByRole("heading", { level: 3, name: "Before we arrive" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Pets" })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("move");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Clear the sills", "Unlock the gate"]);
  });
  it("renders HTML in a template as text, never as markup", () => {
    const hostile = '<script>alert("x")</script><img src=x onerror="alert(1)"><b>b</b>';
    const { container } = render(<DocText blocks={[{ type: "paragraph", inlines: [t(hostile)] }]} />);
    expect(container.querySelector("script, img, b")).toBeNull();
    expect(container).toHaveTextContent(hostile);
  });
  it("shows a field as its marker, highlighted only when asked", () => {
    const blocks: Block[] = [{ type: "paragraph", inlines: [t("Deposit "), { type: "field", key: "deposit", bold: true }] }];
    const { container, rerender } = render(<DocText blocks={blocks} />);
    expect(container).toHaveTextContent("Deposit {{deposit}}");
    expect(container.querySelector("mark")).toBeNull();
    rerender(<DocText blocks={blocks} highlightFields />);
    expect(container.querySelector("strong mark")).toHaveTextContent("{{deposit}}");
  });
});
