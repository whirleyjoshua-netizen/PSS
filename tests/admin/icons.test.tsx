import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Icon, ICON_NAMES } from "@/components/admin/icons";

describe("Icon", () => {
  it("renders every icon as decorative SVG", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} className="size-4" />);
      const svg = container.querySelector("svg")!;
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
      expect(svg.getAttribute("class")).toContain("size-4");
      unmount();
    }
  });
});
