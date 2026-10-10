import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/admin/Markdown";

describe("Markdown", () => {
  it("renders tables and headings", () => {
    render(<Markdown source={"# Brief\n\n| a | b |\n|---|---|\n| 1 | 2 |"} />);
    expect(screen.getByRole("heading", { name: "Brief" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("never renders raw HTML from a report", () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script><img src=x onerror=alert(1)> ok'} />);
    expect(container.querySelector("script, img")).toBeNull();
  });
  it("never loads a Markdown image (a tracking pixel in a quoted page), and keeps the text around it", () => {
    const { container } = render(<Markdown source={"Before ![pixel](https://tracker.example/p.gif) after\n\n[![badge](https://x.example/b.png)](https://example.com)"} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Before");
    expect(container.textContent).toContain("after");
  });
  it("opens links in a new tab, safely", () => {
    render(<Markdown source="[site](https://example.com)" />);
    const link = screen.getByRole("link", { name: "site" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
