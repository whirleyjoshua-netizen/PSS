import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendGAEvent = vi.fn();
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: (...args: unknown[]) => sendGAEvent(...args) }));

import { GuideCta } from "@/components/guides/GuideCta";
import { guides } from "@/content/guides";
import { business } from "@/content/business";

const guide = guides[0];

beforeEach(() => sendGAEvent.mockReset());

describe("GuideCta", () => {
  it("inline: shows the guide's own copy, books at /contact and calls the business number", () => {
    render(<GuideCta slug={guide.slug} variant="inline" cta={guide.cta} />);
    expect(screen.getByText(guide.cta.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: guide.cta.headline })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a free in-home measure" })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: `Call ${business.phone.display}` })).toHaveAttribute("href", business.phone.href);
  });

  it("aside: no heading, same two buttons", async () => {
    render(<GuideCta slug={guide.slug} variant="aside" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("link", { name: "Book a free in-home measure" })).toHaveAttribute("href", "/contact");
    const call = screen.getByRole("link", { name: `Call ${business.phone.display}` });
    expect(call).toHaveAttribute("href", business.phone.href);
    await userEvent.setup().click(call);
    expect(sendGAEvent).toHaveBeenCalledWith("event", "guide_cta_click", { guide: guide.slug, kind: "call" });
  });

  it("counts each button with the guide's slug", async () => {
    render(<GuideCta slug={guide.slug} variant="inline" cta={guide.cta} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Book a free in-home measure" }));
    await user.click(screen.getByRole("link", { name: `Call ${business.phone.display}` }));
    expect(sendGAEvent).toHaveBeenCalledWith("event", "guide_cta_click", { guide: guide.slug, kind: "book" });
    expect(sendGAEvent).toHaveBeenCalledWith("event", "guide_cta_click", { guide: guide.slug, kind: "call" });
  });
});
