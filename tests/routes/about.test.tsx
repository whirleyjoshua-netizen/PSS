import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AboutPage, { metadata } from "@/app/(site)/about/page";

describe("/about — Meet the family", () => {
  it("is titled Meet the family with one h1 and the same canonical", () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Meet the family");
    expect(metadata.title).toBe("Meet the Family | Premier Shade Solutions");
    expect(metadata.alternates?.canonical).toBe("/about");
  });

  it("tells the story in its four parts", () => {
    render(<AboutPage />);
    for (const lead of [
      "It started with Josh’s dad.",
      "Shade’ found the design side.",
      "Now it’s our family’s business.",
      "You let us into your home. We let you into our family.",
    ]) {
      expect(screen.getByText(lead)).toBeInTheDocument();
    }
  });

  it("shows both family photos with descriptive alt text", () => {
    const { container } = render(<AboutPage />);
    const srcs = Array.from(container.querySelectorAll("img")).map((img) =>
      decodeURIComponent(img.getAttribute("src") ?? ""),
    );
    // Owner 2026-10-01: Josh with both kids and Shade with both kids; the
    // three-of-us photo moved to the homepage.
    expect(srcs.some((src) => src.includes("/brand/josh-with-kids.webp"))).toBe(true);
    expect(srcs.some((src) => src.includes("/brand/shade-with-kids.webp"))).toBe(true);
    expect(srcs.some((src) => /family-pumpkin|owners-family/.test(src))).toBe(false);
    for (const img of container.querySelectorAll("img")) {
      expect((img.getAttribute("alt") ?? "").length).toBeGreaterThan(20);
    }
  });

  it("books with Invite Us Over", () => {
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: /invite us over/i })).toHaveAttribute("href", "/contact");
  });
});
