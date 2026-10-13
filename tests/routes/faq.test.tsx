import { render, screen, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import { describe, it, expect } from "vitest";
import FaqPage, { metadata } from "@/app/(site)/faq/page";
import { faqPageSchema } from "@/app/(site)/faq/schema";
import { FAQ_GROUPS, FAQ_ITEMS } from "@/content/faq";
import { LEAD_TIME_LINE } from "@/content/consultation";
import { WARRANTY } from "@/content/warranty";
import { guides } from "@/content/guides";
import { categories, products } from "@/content/products";
import { cities } from "@/content/cities";
import { business } from "@/content/business";

const words = (text: string) => text.trim().split(/\s+/).length;

describe("FAQ content", () => {
  it("keeps the consultant's 24 questions in her six groups", () => {
    expect(FAQ_GROUPS).toHaveLength(6);
    expect(FAQ_ITEMS).toHaveLength(24);
    expect(new Set(FAQ_ITEMS.map((item) => item.q)).size).toBe(24);
  });

  it.each(FAQ_ITEMS.map((item) => [item.q, item] as const))("%s is answered in 40–120 words", (_q, item) => {
    expect(item.q.endsWith("?")).toBe(true);
    const count = words(item.a);
    expect(count).toBeGreaterThanOrEqual(40);
    expect(count).toBeLessThanOrEqual(120);
  });

  it("links only to pages that exist", () => {
    const routes = new Set([
      "/about", "/reviews", "/gallery", "/contact", "/faq",
      ...categories.map((c) => `/${c.slug}`),
      ...products.map((p) => `/${p.category}/${p.slug}`),
      ...cities.map((c) => `/service-area/${c.slug}`),
      ...guides.map((g) => `/guides/${g.slug}`),
    ]);
    for (const item of FAQ_ITEMS) {
      for (const link of item.links ?? []) expect(routes.has(link.href), `${item.q} → ${link.href}`).toBe(true);
    }
  });

  it("quotes lead times and the warranty from their one source", () => {
    const lead = FAQ_ITEMS.find((item) => /How long does it take/.test(item.q))!;
    expect(lead.a.toLowerCase()).toContain(LEAD_TIME_LINE.toLowerCase());
    expect(lead.a).toContain("counted from the day you order");
    const warranty = FAQ_ITEMS.find((item) => /warranty/.test(item.q))!;
    for (const line of Object.values(WARRANTY)) expect(warranty.a).toContain(line);
  });

  it("names every service-area city and links its page", () => {
    const areas = FAQ_ITEMS.find((item) => /What areas/.test(item.q))!;
    for (const city of cities) {
      expect(areas.a).toContain(city.name);
      expect(areas.links?.map((l) => l.href)).toContain(`/service-area/${city.slug}`);
    }
  });

  it("publishes no price", () => {
    for (const item of FAQ_ITEMS.filter((i) => !/warranty/.test(i.q))) expect(item.a, item.q).not.toMatch(/\$\d/);
  });
});

describe("FAQ page", () => {
  it("is one H1, an H2 per group and an H3 per question", () => {
    const { container } = render(<FaqPage />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Questions and answers." })).toBeInTheDocument();
    for (const group of FAQ_GROUPS) {
      const h2 = screen.getByRole("heading", { level: 2, name: group.title });
      const section = h2.closest("section")!;
      expect(section.id).toBe(group.id);
      expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(
        group.items.map((item) => item.q),
      );
    }
    for (const item of FAQ_ITEMS) expect(screen.getByText(item.a)).toBeInTheDocument();
  });

  it("lists every repair guide under Care and repair, at #care", () => {
    render(<FaqPage />);
    const care = screen.getByRole("heading", { level: 2, name: "Care and repair." }).closest("section")!;
    expect(care.id).toBe("care");
    for (const guide of guides) {
      expect(within(care).getByRole("link", { name: new RegExp(guide.title.replace(/[?]/g, "\\?")) })).toHaveAttribute(
        "href",
        `/guides/${guide.slug}`,
      );
      expect(within(care).getByText(guide.seo.description)).toBeInTheDocument();
    }
  });

  it("ends with the booking block", () => {
    const { container } = render(<FaqPage />);
    expect(container.querySelector("#book")).not.toBeNull();
  });

  it("carries FAQPage and BreadcrumbList JSON-LD", () => {
    const { container } = render(<FaqPage />);
    const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? ""));
    expect(ld.map((s) => s["@type"]).sort()).toEqual(["BreadcrumbList", "FAQPage"]);
    const crumbs = ld.find((s) => s["@type"] === "BreadcrumbList").itemListElement;
    expect(crumbs.map((c: { name: string; item: string }) => [c.name, c.item])).toEqual([
      ["Home", business.domain],
      ["FAQ", `${business.domain}/faq`],
    ]);
  });
});

describe("FAQPage schema", () => {
  it("is built from the content, one Question per answer, plain text", () => {
    const schema = faqPageSchema(FAQ_GROUPS);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toEqual(
      FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    );
  });
});

describe("FAQ metadata", () => {
  it("has a title that fits a results page and a description that ends on the offer", () => {
    expect(metadata.title).toBe("Window Treatment FAQs | Premier Shade Solutions Las Vegas");
    expect(String(metadata.title).length).toBeLessThanOrEqual(65);
    const description = String(metadata.description);
    expect(description.length).toBeGreaterThanOrEqual(130);
    expect(description.length).toBeLessThanOrEqual(160);
    for (const word of ["blinds", "shades", "shutters", "motorization", "Las Vegas"]) expect(description).toContain(word);
    expect(description.endsWith("Free in-home consultation.")).toBe(true);
    expect(metadata.alternates?.canonical).toBe("/faq");
  });

  it("keeps the share image: openGraph leaves images to the segment's opengraph-image file", () => {
    // A page-level openGraph replaces the parent's whole object, image included. Next only fills the
    // image back in from an opengraph-image file in the page's own segment, and only if `images` is unset.
    expect(metadata.openGraph).toMatchObject({ url: "/faq", title: metadata.title, description: metadata.description });
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(existsSync("app/(site)/faq/opengraph-image.tsx")).toBe(true);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});
