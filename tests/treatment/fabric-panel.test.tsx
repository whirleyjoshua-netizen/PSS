import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FabricPanel } from "@/components/treatment/FabricPanel";

describe("FabricPanel", () => {
  it("is decorative and shows the name in light serif lettering", () => {
    const { container } = render(<FabricPanel label="Solar Shades" className="aspect-4/3" />);
    const panel = container.firstElementChild!;
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel.className).toContain("bg-sand");
    expect(panel.className).toContain("aspect-4/3");
    expect(panel.textContent).toBe("Solar Shades");
    expect(container.querySelector("img")).toBeNull();
  });
});
