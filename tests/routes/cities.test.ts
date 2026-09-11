import { describe, it, expect } from "vitest";
import { cities } from "@/content/cities";
import { citySlug, cityPath, getCity } from "@/lib/content/cities";
import { business } from "@/content/business";
import { generateStaticParams as cityParams } from "@/app/(site)/service-area/[city]/page";

describe("city content", () => {
  it("covers exactly the service area, in the same order", () => {
    expect(cities.map((city) => city.name)).toEqual([...business.serviceArea]);
  });

  it("slugs multi-word city names correctly", () => {
    expect(citySlug("North Las Vegas")).toBe("north-las-vegas");
    expect(cityPath("Henderson")).toBe("/service-area/henderson");
  });

  it("resolves a known city and rejects an unknown one", () => {
    expect(getCity("summerlin")?.name).toBe("Summerlin");
    expect(getCity("phoenix")).toBeUndefined();
  });

  /**
   * The important one. Near-duplicate city pages are treated as doorway pages
   * and penalized. Each page must say something true and different.
   */
  it("gives each city distinct intro copy", () => {
    const intros = cities.map((city) => city.intro.join(" "));
    expect(new Set(intros).size).toBe(cities.length);
  });

  it("gives each city a distinct climate note", () => {
    const notes = cities.map((city) => city.climateNote);
    expect(new Set(notes).size).toBe(cities.length);
  });

  it("names real neighborhoods for each city", () => {
    for (const city of cities) {
      expect(city.neighborhoods.length).toBeGreaterThanOrEqual(3);
      expect(new Set(city.neighborhoods).size).toBe(city.neighborhoods.length);
    }
  });

  it("gives each city SEO copy that fits and names the city", () => {
    for (const city of cities) {
      expect(city.seo.title.length).toBeLessThanOrEqual(60);
      expect(city.seo.description.length).toBeLessThanOrEqual(160);
      expect(city.seo.description).toContain(city.name);
    }
  });

  it("generates one static route per city", async () => {
    expect(await cityParams()).toHaveLength(4);
  });
});
