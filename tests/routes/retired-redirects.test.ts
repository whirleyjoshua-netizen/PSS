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
