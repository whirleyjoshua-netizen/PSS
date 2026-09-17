import { describe, it, expect } from "vitest";
import { mapsDirectionsUrl } from "@/lib/routes/maps-link";

describe("mapsDirectionsUrl", () => {
  it("lists the stops in order as a google.com/maps/dir URL", () => {
    expect(mapsDirectionsUrl([{ lat: 36.1, lng: -115.1 }, { lat: 36.2, lng: -115.2 }]))
      .toBe("https://www.google.com/maps/dir/36.1,-115.1/36.2,-115.2");
  });
  it("has nothing to open for an empty route", () => {
    expect(mapsDirectionsUrl([])).toBeNull();
  });
});
