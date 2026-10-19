import { describe, it, expect } from "vitest";
import nextConfig from "@/next.config";

/** Products we no longer carry: old links and search results land on their category, permanently. */
describe("retired product redirects", () => {
  it.each([
    ["/blinds/aluminum-blinds", "/blinds"],
    ["/blinds/mini-blinds", "/blinds"],
    ["/outdoor/patio-shades", "/outdoor"],
    ["/outdoor/rolling-shutters", "/outdoor"],
  ])("%s → %s", async (source, destination) => {
    const rules = await nextConfig.redirects!();
    expect(rules).toContainEqual({ source, destination, permanent: true });
  });
});

/** The repair guides folded into the FAQ (2026-10-13): the index lands on its Care and repair section; articles stay live. */
describe("guides index redirect", () => {
  it("sends /guides to /faq#care, permanently", async () => {
    const rules = await nextConfig.redirects!();
    expect(rules).toContainEqual({ source: "/guides", destination: "/faq#care", permanent: true });
  });

  it("leaves every guide article where it is", async () => {
    const rules = await nextConfig.redirects!();
    // An exact "/guides" source never matches /guides/<slug>; a wildcard here would break every article.
    expect(rules.map((rule) => rule.source).filter((s) => s.startsWith("/guides"))).toEqual(["/guides"]);
  });
});
