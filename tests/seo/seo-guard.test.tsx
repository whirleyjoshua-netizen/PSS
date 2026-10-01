import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// app/layout.tsx calls next/font/google at import time. That is a build-time transform; under vitest
// the named exports are not callable, so importing the root metadata would throw.
vi.mock("next/font/google", () => {
  const font = () => ({ className: "font-google", variable: "--font-google", style: { fontFamily: "google" } });
  return { Jost: font, Source_Serif_4: font };
});
import { metadata as rootMetadata } from "@/app/layout";
import Home from "@/app/(site)/page";
import AboutPage from "@/app/(site)/about/page";
import { localBusinessSchema } from "@/lib/seo/schema";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { cities } from "@/content/cities";

const hrefs = (container: HTMLElement) =>
  new Set(Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href")));

describe("SEO inventory survives the family redesign (spec §2)", () => {
  it("keeps the root title and description", () => {
    const title = rootMetadata.title as { default: string };
    expect(title.default).toBe("Custom Blinds, Shades & Shutters in Las Vegas | Premier Shade Solutions");
    expect(rootMetadata.description).toBe(
      "Custom blinds, shades, shutters, and motorized window treatments for Las Vegas, Henderson, Summerlin, and North Las Vegas. Free in-home consultation.",
    );
  });

  it("keeps every homepage internal link", () => {
    const links = hrefs(render(<Home />).container);
    for (const path of [
      ...categories.map((c) => `/${c.slug}`),
      ...cities.map((c) => `/service-area/${c.slug}`),
      "/gallery",
      "/about",
      "/contact",
      "/reviews",
      business.phone.href,
    ]) {
      expect(links.has(path), path).toBe(true);
    }
  });

  it("keeps exactly one h1 on the homepage and About", () => {
    expect(render(<Home />).container.querySelectorAll("h1")).toHaveLength(1);
    expect(render(<AboutPage />).container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("keeps the LocalBusiness essentials, with the new slogan", () => {
    const schema = localBusinessSchema() as Record<string, unknown>;
    expect(schema.name).toBe(business.name);
    expect(schema.telephone).toBe(business.phone.display);
    expect(schema.areaServed).toHaveLength(business.serviceArea.length);
    expect(schema.sameAs).toBeDefined();
    expect(schema.slogan).toBe("You let us into your home. We let you into our family.");
  });
});
