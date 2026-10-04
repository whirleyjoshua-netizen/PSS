import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import GuidePage, { generateMetadata, generateStaticParams } from "@/app/(site)/guides/[slug]/page";
import { guides } from "@/content/guides";

const renderGuide = async (slug: string) => render(await GuidePage({ params: Promise.resolve({ slug }) }));

describe("guide page", () => {
  it("builds one static page per guide", async () => {
    expect(await generateStaticParams()).toEqual(guides.map((g) => ({ slug: g.slug })));
  });

  it.each(guides.map((g) => [g.slug, g] as const))("%s renders the approved layout", async (_slug, guide) => {
    const { container } = await renderGuide(guide.slug);

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: guide.title })).toBeInTheDocument();
    expect(screen.getByText(guide.quickAnswer)).toBeInTheDocument();
    expect(screen.getByText(/Updated [A-Z][a-z]{2} \d{4}/)).toBeInTheDocument();

    const steps = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
    expect(steps).toHaveLength(guide.steps.length);
    steps.forEach((li, i) => {
      expect(li.querySelectorAll("svg[role=img]")).toHaveLength(1);
      expect(within(li).getByRole("heading", { level: 3, name: guide.steps[i].title })).toBeInTheDocument();
      expect(li.textContent).toContain(guide.steps[i].sideView ? `Step ${i + 1} · side view` : `Step ${i + 1}`);
    });

    expect(screen.getByRole("heading", { level: 2, name: "Why it happens" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: guide.cta.headline })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Book a free in-home measure" })) {
      expect(link).toHaveAttribute("href", "/contact");
    }
    for (const { q } of guide.faq) expect(screen.getByText(q)).toBeInTheDocument();
    for (const slug of guide.related) {
      expect(container.querySelector(`a[href="/guides/${slug}"]`)).not.toBeNull();
    }

    const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? ""));
    expect(ld.map((s) => s["@type"]).sort()).toEqual(["Article", "BreadcrumbList"]);
  });

  it("returns a 404 for an unknown guide", async () => {
    await expect(GuidePage({ params: Promise.resolve({ slug: "nope" }) })).rejects.toThrow();
  });

  it("sets the title, description and canonical from the guide", async () => {
    const guide = guides[1];
    const meta = await generateMetadata({ params: Promise.resolve({ slug: guide.slug }) });
    expect(meta.title).toBe(guide.seo.title);
    expect(meta.description).toBe(guide.seo.description);
    expect(meta.alternates?.canonical).toBe(`/guides/${guide.slug}`);
  });
});
