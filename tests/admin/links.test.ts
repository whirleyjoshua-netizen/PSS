import { describe, it, expect } from "vitest";
import { boardHref, mapsHref } from "@/lib/admin/links";

describe("boardHref", () => {
  it("is the plain board with nothing set", () => {
    expect(boardHref({ lost: false })).toBe("/admin");
  });
  it("opens a panel and keeps the lost toggle", () => {
    expect(boardHref({ lost: false, job: "abc" })).toBe("/admin?job=abc");
    expect(boardHref({ lost: true, job: "abc" })).toBe("/admin?lost=1&job=abc");
    expect(boardHref({ lost: true, job: null })).toBe("/admin?lost=1");
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
