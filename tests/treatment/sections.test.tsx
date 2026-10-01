import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { IconRow } from "@/components/treatment/IconRow";
import { StorySection } from "@/components/treatment/StorySection";
import { PhotoCardGrid } from "@/components/treatment/PhotoCardGrid";
import { DetailsBand } from "@/components/treatment/DetailsBand";
import { consultationPhoto } from "@/content/gallery";

describe("IconRow", () => {
  it("lists four labels, each with a decorative icon", () => {
    render(<IconRow items={[{ label: "Light control", icon: "sun" }, { label: "Privacy", icon: "eye" }, { label: "Energy savings", icon: "leaf" }, { label: "Desert-ready fabrics", icon: "home" }]} />);
    const items = within(screen.getByRole("list", { name: "Highlights" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Light control", "Privacy", "Energy savings", "Desert-ready fabrics"]);
    items.forEach((li) => expect(li.querySelector("svg[aria-hidden='true']")).not.toBeNull());
  });
});

describe("StorySection", () => {
  const props = {
    eyebrow: "More than a window covering",
    heading: "A Single Panel That Changes the Room",
    paragraphs: ["First paragraph of the intro.", "Second paragraph of the intro."],
    panelLabel: "Shades",
    caption: { eyebrow: "Chosen for this valley", line: "The right fabric for every exposure." },
  };

  it("shows eyebrow, serif h2, every paragraph, the caption card and Meet the family", () => {
    render(<StorySection {...props} photo={consultationPhoto} />);
    expect(screen.getByText(props.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: props.heading }).className).toContain("heading-serif");
    props.paragraphs.forEach((p) => expect(screen.getByText(p)).toBeInTheDocument());
    expect(screen.getByText(props.caption.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(props.caption.line)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meet the family" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });

  it("shows the fabric panel, and no photo, when there is none", () => {
    const { container } = render(<StorySection {...props} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[aria-hidden='true'].bg-sand")?.textContent).toBe("Shades");
  });
});

describe("PhotoCardGrid", () => {
  it("links each card, with its photo or the fabric panel", () => {
    const { container } = render(
      <PhotoCardGrid
        heading="Explore Shades"
        cards={[
          { href: "/shades/roller-shades", name: "Roller Shades", tagline: "One clean line of fabric.", photo: consultationPhoto },
          { href: "/shades/solar-shades", name: "Solar Shades", tagline: "See out. Keep the heat out." },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Explore Shades" })).toBeInTheDocument();
    const roller = screen.getByRole("link", { name: /Roller Shades/ });
    expect(roller).toHaveAttribute("href", "/shades/roller-shades");
    expect(roller.querySelector("img")).not.toBeNull();
    const solar = screen.getByRole("link", { name: /Solar Shades/ });
    expect(solar.querySelector("img")).toBeNull();
    expect(solar.querySelector("[aria-hidden='true'].bg-sand")).not.toBeNull();
    expect(container.querySelectorAll("h3")).toHaveLength(2);
  });
});

describe("DetailsBand", () => {
  it("lists every feature under a Details heading", () => {
    render(<DetailsBand features={["Cordless lift", "Blackout fabrics"]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Cordless lift", "Blackout fabrics"]);
  });
});
