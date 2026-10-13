import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import type { Metadata } from "next";

// app/layout.tsx calls next/font/google at import time (see seo-guard.test.tsx).
vi.mock("next/font/google", () => {
  const font = () => ({ className: "font-google", variable: "--font-google", style: { fontFamily: "google" } });
  return { Jost: font, Source_Serif_4: font };
});
import { metadata as root } from "@/app/layout";
import { metadata as home } from "@/app/(site)/page";
import { metadata as about } from "@/app/(site)/about/page";
import { metadata as gallery } from "@/app/(site)/gallery/page";
import { metadata as reviews } from "@/app/(site)/reviews/page";
import { metadata as privacy } from "@/app/(site)/privacy/page";
import { metadata as contact } from "@/app/(site)/contact/page";
import { metadata as accessibility } from "@/app/(site)/accessibility/page";
import { OG_IMAGES } from "@/lib/seo/og-images";
import { business } from "@/content/business";

/** Width and height from a baseline or progressive JPEG's start-of-frame marker. */
function jpegSize(file: Buffer): { width: number; height: number } {
  let at = 2;
  while (at < file.length) {
    const marker = file[at + 1]!;
    const length = file.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: file.readUInt16BE(at + 5), width: file.readUInt16BE(at + 7) };
    at += 2 + length;
  }
  throw new Error("no SOF marker");
}

describe("Open Graph JPEGs (some share previews skip WebP)", () => {
  it.each(Object.entries(OG_IMAGES))("%s has a small JPEG copy whose real size is the one we declare", (_src, og) => {
    const file = path.join(process.cwd(), "public", og.url);
    const bytes = readFileSync(file);
    expect(og.url).toMatch(/^\/og\/.+\.jpg$/);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(statSync(file).size).toBeLessThan(300 * 1024);
    expect(jpegSize(bytes)).toEqual({ width: og.width, height: og.height });
    expect(og.width).toBeLessThanOrEqual(1200);
  });

  it("every JPEG is a copy of a photo that exists", () => {
    for (const src of Object.keys(OG_IMAGES)) expect(statSync(path.join(process.cwd(), "public", src)).isFile()).toBe(true);
  });
});

describe("pages that used to inherit the homepage's og:url", () => {
  it("the root layout no longer sets one", () => {
    expect((root.openGraph as Record<string, unknown>).url).toBeUndefined();
  });

  it("the homepage sets its own url and title", () => {
    const og = home.openGraph as Record<string, unknown>;
    expect(og.url).toBe("/");
    expect(og.title).toBe((root.title as { default: string }).default);
    expect(og.description).toBe(root.description);
    expect(og.siteName).toBe(business.name);
    expect(home.alternates?.canonical).toBe("/");
  });

  it.each([
    ["/about", about],
    ["/gallery", gallery],
    ["/reviews", reviews],
    ["/privacy", privacy],
    ["/contact", contact],
    ["/accessibility", accessibility],
  ] as [string, Metadata][])("%s shares its own url, title and a sized JPEG", (route, metadata) => {
    const og = metadata.openGraph as Record<string, unknown>;
    expect(og.url).toBe(route);
    expect(og.title).toBe(metadata.title);
    expect(og.description).toBe(metadata.description);
    expect(og.siteName).toBe(business.name);
    expect(metadata.alternates?.canonical).toBe(route);
    const [image] = og.images as { url: string; width: number; height: number; alt: string }[];
    expect(image!.url).toMatch(/^\/og\/.+\.jpg$/);
    expect(image!.width).toBeGreaterThan(0);
    expect(image!.height).toBeGreaterThan(0);
    expect(image!.alt.length).toBeGreaterThan(10);
  });
});
