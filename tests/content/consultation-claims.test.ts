import { describe, it, expect } from "vitest";
import { FAQ, PAINS, STEPS } from "@/content/consultation";

/** Takedown is a priced install extra (migration 027); only the haul-away is free. */
describe("the landing page never calls takedown free", () => {
  it("promises a free haul-away, not a free takedown", () => {
    const text = [...PAINS.map((p) => p.body), ...STEPS.map((s) => s.body), ...FAQ.map((f) => f.a)].join(" ");
    expect(text).not.toMatch(/take (them|your old blinds) down[^.]*free/i);
    expect(FAQ.find((f) => /old blinds/.test(f.q))!.a).toMatch(/Taking them down is priced per window on your quote/);
  });
});

/** The owner can't always quote at the visit (2026-10-08), so no customer-facing copy promises when the quote arrives. */
describe("no copy promises the quote at the visit", () => {
  it("never says 'before we leave' or 'on the spot' about the quote", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const offenders = ["app", "components", "content", "lib"]
      .flatMap(files)
      .filter((f) => /quote[^.]{0,40}(before we leave|on the spot)/i.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("temporary shades", () => {
  it("are promised free, as the owner confirmed on 2026-10-08", () => {
    expect(PAINS.find((p) => /took forever/.test(p.heard))!.body).toMatch(/temporary shades, free/);
  });
});

/** The owner's promise is accountability, not headcount: it must stay true as the business grows (2026-10-09). */
describe("no copy promises a headcount", () => {
  it("never promises 'two people' or 'the same faces'", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const offenders = ["app", "components", "content", "lib"]
      .flatMap(files)
      .filter((f) => /two people|same (two )?faces|same people who/i.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("answers 'they disappeared' with the family business and no third-party installers", () => {
    const pain = PAINS.find((p) => /had my money/.test(p.heard))!;
    expect(pain.answer).toBe("From your first call to the final install, we're family.");
    expect(pain.body).toMatch(/never hand you off to a third party for install/);
  });
});

/** The owner's name is Shade’, with the mark (2026-10-09). Customer review quotes in content/reviews.ts stay verbatim. */
describe("Shade’ is written with the mark", () => {
  it("never names her as plain 'Shade' in site copy", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const offenders = ["app", "components", "content", "lib"]
      .flatMap(files)
      .filter((f) => !f.endsWith(join("content", "reviews.ts")))
      .filter((f) => /\b(Josh (and|or) Shade|Shade (and|or) Josh|Shade (designs|found|smiling|personally))\b(?!’)|Shade's|About Shade"/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

/** Owner 2026-10-10: the 10% covers shades or blinds; copy that says only "shades" under-sells it. */
describe("the holiday 10% names shades or blinds", () => {
  it("never says '10% off 3 or more custom shades' without 'or blinds'", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const offenders = ["app", "components", "content", "lib"]
      .flatMap(files)
      .filter((f) => /10% off 3 or more custom shades(?! or blinds)/i.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
