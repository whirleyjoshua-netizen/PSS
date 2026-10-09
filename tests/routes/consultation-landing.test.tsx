import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ConsultationPage, { metadata as generalMetadata } from "@/app/(site)/consultation/page";
import CategoryConsultationPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/(site)/consultation/[category]/page";
import sitemap from "@/app/sitemap";
import { FAQ, LANDING_VARIANTS, PAINS, STEPS } from "@/content/consultation";
import { leadTimes } from "@/content/lead-times";
import { getCategory } from "@/lib/content/products";

const params = (category: string) => ({ params: Promise.resolve({ category }) });
const renderVariant = async (category: string) => render(await CategoryConsultationPage(params(category)));
const treatmentsSent = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLInputElement>('form input[name="treatments"]')).map((i) => i.value);

/** What every version of the landing page must do for an ad visitor. */
function expectLandingBasics(container: HTMLElement) {
  expect(container.querySelectorAll("form")).toHaveLength(1);
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  // An ad visitor has one job here: no breadcrumb trail leading off the page.
  expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  // The form comes before the pains, so a phone reaches it first.
  const form = container.querySelector("form")!;
  const firstPain = screen.getByRole("heading", { name: PAINS[0]!.answer });
  expect(form.compareDocumentPosition(firstPain) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for (const pain of PAINS) {
    expect(screen.getByText(pain.heard)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: pain.answer })).toBeInTheDocument();
  }
  for (const step of STEPS) expect(screen.getByRole("heading", { name: step.title })).toBeInTheDocument();
  for (const { q } of FAQ) expect(screen.getByText(q)).toBeInTheDocument();
  const closing = screen.getAllByRole("link", { name: /invite us over/i });
  expect(closing).toHaveLength(1);
  expect(closing[0]).toHaveAttribute("href", "#book");
}

describe("/consultation", () => {
  it("is the general landing page: form first, the five pains, steps, FAQ, closing link to the form", () => {
    const { container } = render(<ConsultationPage />);
    expectLandingBasics(container);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Beautiful Windows, Measured Right the First Time");
    expect(treatmentsSent(container)).toEqual([]);
  });

  it("stays out of search results", () => {
    expect(generalMetadata.robots).toEqual({ index: false, follow: true });
  });
});

describe.each(Object.entries(LANDING_VARIANTS).map(([slug, v]) => [slug, v!.noun] as const))(
  "/consultation/%s",
  (slug, noun) => {
    it("has the landing basics and the product in the headline", async () => {
      const { container } = await renderVariant(slug);
      expectLandingBasics(container);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`Beautiful ${noun}, Measured Right the First Time`);
    });

    it("files the lead under the category, like the category page does", async () => {
      const { container } = await renderVariant(slug);
      expect(treatmentsSent(container)).toEqual([getCategory(slug)!.name]);
    });

    it("stays out of search results", async () => {
      expect((await generateMetadata(params(slug))).robots).toEqual({ index: false, follow: true });
    });
  },
);

describe("landing routes", () => {
  it("builds exactly the ad groups' variants, each a real category", async () => {
    const built = (await generateStaticParams()).map((p) => p.category).sort();
    expect(built).toEqual(["blinds", "motorization", "outdoor", "shades", "shutters"]);
    for (const slug of built) expect(getCategory(slug)).toBeDefined();
  });

  it("is not in the sitemap", () => {
    expect(sitemap().some((entry) => new URL(entry.url).pathname.startsWith("/consultation"))).toBe(false);
  });

  it("quotes the lead times from content/lead-times.ts, so the page and the terms never disagree", () => {
    const weeks = (label: string) => {
      const t = leadTimes.find((l) => l.label === label)!;
      return `${t.minWeeks}–${t.maxWeeks} weeks`;
    };
    expect(PAINS[0]!.body).toContain(`${weeks("Blinds")} for blinds and shades, ${weeks("Shutters")} for shutters`);
    expect(FAQ[0]!.a).toContain(weeks("Shutters"));
  });

  it("answers each pain with the promise the owner confirmed on 2026-10-08", () => {
    const answer = (heard: RegExp) => PAINS.find((p) => heard.test(p.heard))!.body;
    expect(answer(/took forever/)).toMatch(/temporary shades/);
    expect(answer(/measured wrong/)).toMatch(/Josh measures every window himself.*remake it/);
    expect(answer(/called me back/)).toMatch(/text Shade’ or Josh directly/);
    expect(answer(/left a mess/)).toMatch(/clean up.*haul your old blinds away for free/);
    expect(answer(/had my money/)).toMatch(/walk through every window with you.*stand behind the job/);
  });
});
