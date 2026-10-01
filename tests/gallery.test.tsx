import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import GalleryPage from "@/app/(site)/gallery/page";

// The empty-gallery branch only renders before any photos are published.
vi.mock("@/content/gallery", () => ({ gallery: [] }));

describe("Gallery, before any photos are published", () => {
  it("invites the visitor over with the free consultation line beside the button", () => {
    render(<GalleryPage />);
    const intro = screen.getByText(/we are photographing recent installations now/i).parentElement!;
    expect(within(intro).getByRole("link", { name: /invite us over/i })).toHaveAttribute("href", "/contact");
    expect(within(intro).getByText(/free in-home consultation\. no charge, no obligation\./i)).toBeInTheDocument();
  });
});
