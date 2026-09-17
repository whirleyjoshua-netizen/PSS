import { describe, it, expect } from "vitest";
import { mapsDirectionsUrl, mapsDirectionsUrls } from "@/lib/routes/maps-link";

describe("mapsDirectionsUrl", () => {
  it("lists the stops in order as a google.com/maps/dir URL", () => {
    expect(mapsDirectionsUrl([{ lat: 36.1, lng: -115.1 }, { lat: 36.2, lng: -115.2 }]))
      .toBe("https://www.google.com/maps/dir/36.1,-115.1/36.2,-115.2");
  });
  it("has nothing to open for an empty route", () => {
    expect(mapsDirectionsUrl([])).toBeNull();
  });
});

describe("mapsDirectionsUrls", () => {
  const points = Array.from({ length: 23 }, (_, i) => ({ lat: i, lng: -i }));
  const coords = (url: string) => url.replace("https://www.google.com/maps/dir/", "").split("/");

  it("keeps a short route in one link", () => {
    expect(mapsDirectionsUrls(points.slice(0, 10))).toEqual([mapsDirectionsUrl(points.slice(0, 10))]);
    expect(mapsDirectionsUrls([])).toEqual([]);
  });

  it("splits 23 stops into parts of at most 10, each continuing from the last stop", () => {
    const urls = mapsDirectionsUrls(points);
    expect(urls.map((u) => coords(u))).toEqual([
      points.slice(0, 10).map((p) => `${p.lat},${p.lng}`),
      points.slice(9, 19).map((p) => `${p.lat},${p.lng}`),
      points.slice(18, 23).map((p) => `${p.lat},${p.lng}`),
    ]);
  });
});
