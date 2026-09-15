import { describe, it, expect } from "vitest";
import { boardHref, mapsHref } from "@/lib/admin/links";

describe("boardHref", () => {
  it("is the plain board with nothing set", () => {
    expect(boardHref({})).toBe("/admin");
  });
  it("carries the search, the list filter and the open job, in that order", () => {
    expect(boardHref({ job: "abc" })).toBe("/admin?job=abc");
    expect(boardHref({ list: "completed", job: "abc" })).toBe("/admin?list=completed&job=abc");
    expect(boardHref({ q: "reyes smith", list: "lost", job: "abc" })).toBe("/admin?q=reyes%20smith&list=lost&job=abc");
    expect(boardHref({ q: "", list: null, job: null })).toBe("/admin");
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
