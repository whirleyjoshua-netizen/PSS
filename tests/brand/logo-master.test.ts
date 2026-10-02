import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildLogoMaster } from "@/lib/brand/build-logo-master";
import { LOGO_MASTER_PDF_BASE64 } from "@/lib/brand/logo-master";

/**
 * The logo every PDF prints. Changing it must be deliberate: rebuild with
 * `npx -y tsx scripts/build-logo-master.ts`, look at it, then update this hash.
 */
const PINNED_SHA256 = "7698b87e8cdcd56bcfb563a6cbe8c8d3092cdca9bb952910c373b61248cf3f18";

const shipped = new Uint8Array(Buffer.from(LOGO_MASTER_PDF_BASE64, "base64"));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("logo master", () => {
  it("is the pinned file", () => {
    expect(sha(shipped)).toBe(PINNED_SHA256);
  });

  it("is what the builder draws from lib/brand/logo-geometry.ts and Jost, byte for byte", async () => {
    expect(sha(await buildLogoMaster(new Uint8Array(readFileSync("lib/pdf/fonts/Jost.ttf"))))).toBe(sha(shipped));
  });

  it("public/brand/logo-master.pdf is the same file", () => {
    expect(sha(new Uint8Array(readFileSync("public/brand/logo-master.pdf")))).toBe(sha(shipped));
  });

  it("has the lockup on page 1 and the mark on page 2, each page the artwork's own proportions", async () => {
    const doc = await PDFDocument.load(shipped);
    const [lockup, mark] = doc.getPages().map((p) => p.getSize());
    expect(doc.getPageCount()).toBe(2);
    expect(lockup.width / lockup.height).toBeGreaterThan(3);
    expect(mark.width / mark.height).toBeCloseTo(76 / 106, 6);
  });
});
