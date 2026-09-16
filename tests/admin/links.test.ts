import { describe, it, expect } from "vitest";
import { boardHref, mapsHref } from "@/lib/admin/links";

describe("boardHref", () => {
  it("is the plain board with nothing set", () => {
    expect(boardHref({})).toBe("/admin");
  });
  it("carries the search and the list filter, in that order", () => {
    expect(boardHref({ list: "completed" })).toBe("/admin?list=completed");
    expect(boardHref({ q: "reyes smith", list: "lost" })).toBe("/admin?q=reyes%20smith&list=lost");
    expect(boardHref({ q: "", list: null })).toBe("/admin");
  });
});

describe("mapsHref", () => {
  it("searches the address and city in Nevada", () => {
    expect(mapsHref("12 Main St", "Henderson")).toBe("https://maps.google.com/?q=12%20Main%20St%2C%20Henderson%2C%20NV");
  });
  it("works without a street address", () => {
    expect(mapsHref(null, "Henderson")).toBe("https://maps.google.com/?q=Henderson%2C%20NV");
  });
});
