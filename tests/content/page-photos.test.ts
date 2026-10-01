import { describe, it, expect } from "vitest";
import { uniquePhotos } from "@/lib/content/page-photos";

const a = { src: "/gallery/a.webp", alt: "A" };
const b = { src: "/gallery/b.webp", alt: "B" };

describe("uniquePhotos", () => {
  it("keeps every slot when no photo repeats", () => {
    expect(uniquePhotos([a, b, undefined])).toEqual([a, b, undefined]);
  });

  it("blanks a later slot whose photo already appeared higher on the page", () => {
    expect(uniquePhotos([a, b, a, b])).toEqual([a, b, undefined, undefined]);
  });

  it("matches on src, not on object identity", () => {
    expect(uniquePhotos([a, { ...a, alt: "other words" }])).toEqual([a, undefined]);
  });
});
