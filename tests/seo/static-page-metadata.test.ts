import { describe, it, expect, vi } from "vitest";

// app/layout.tsx calls next/font/google at import time (see seo-guard.test.tsx).
vi.mock("next/font/google", () => {
  const font = () => ({ className: "font-google", variable: "--font-google", style: { fontFamily: "google" } });
  return { Jost: font, Source_Serif_4: font };
});
import { metadata as root } from "@/app/layout";
import { metadata as home } from "@/app/(site)/page";
import { metadata as notFound } from "@/app/not-found";
import { metadata as about } from "@/app/(site)/about/page";
import { metadata as gallery } from "@/app/(site)/gallery/page";
import { metadata as reviews } from "@/app/(site)/reviews/page";
import { metadata as privacy } from "@/app/(site)/privacy/page";
import { metadata as contact } from "@/app/(site)/contact/page";
import { cities } from "@/content/cities";

/** SEO audit 2026-10-13. */
describe("site-wide titles", () => {
  it("keeps the homepage title short (was 71) and gives it a canonical", () => {
    expect((root.title as { default: string }).default.length).toBeLessThanOrEqual(61);
    expect(home.alternates?.canonical).toBe("/");
  });

  it("gives the 404 its own title instead of the homepage's", () => {
    expect(notFound.title).toBe("Page not found | Premier Shade Solutions");
  });
});

describe.each([
  ["/about", about],
  ["/gallery", gallery],
  ["/reviews", reviews],
  ["/privacy", privacy],
  ["/contact", contact],
])("%s", (_path, metadata) => {
  it("has a description of at most 160 characters and a branded title", () => {
    expect((metadata.description as string).length).toBeLessThanOrEqual(160);
    expect(metadata.title as string).toMatch(/\| Premier Shade Solutions$/);
  });
});

describe("descriptions the audit found short", () => {
  it.each([
    ["/gallery", gallery.description as string],
    ["/privacy", privacy.description as string],
    ...cities
      .filter((c) => ["las-vegas", "north-las-vegas"].includes(c.slug))
      .map((c) => [`/service-area/${c.slug}`, c.seo.description] as [string, string]),
  ])("%s runs 140–160 characters and ends with the free consultation", (_path, description) => {
    expect(description.length).toBeGreaterThanOrEqual(140);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith("Free in-home consultation.")).toBe(true);
  });
});
