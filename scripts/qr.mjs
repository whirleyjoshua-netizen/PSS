/**
 * Generates print-ready QR codes for marketing material.
 *
 *   node scripts/qr.mjs
 *
 * Writes SVG and PNG into qr-codes/. Use the SVG for anything a printer
 * handles — it is vector, so it stays sharp at any size. The PNG is a
 * convenience for previews and for tools that will not take an SVG.
 *
 * Design choices that matter for scanning off paper:
 *
 * - Error correction level M (15%). H (30%) survives more damage but packs in
 *   more modules, and a denser symbol is HARDER to scan at flyer size with a
 *   phone camera. M is the right trade unless a logo is overlaid.
 * - A real quiet zone. The blank margin around the symbol is part of the
 *   symbol; printing to the edge of it is the most common reason a code fails
 *   to scan. Four modules is the spec minimum.
 * - Pure black on pure white. Brand colors reduce contrast, and scanners want
 *   contrast. The QR goes in a charcoal frame on the flyer, not in champagne.
 * - Short URLs. Every character adds modules. /contact?ref=flyer is about as
 *   long as it should get.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";

const DOMAIN = "https://premiershadesolutions.com";
const OUT = "qr-codes";

const TARGETS = [
  {
    file: "consultation-flyer",
    path: "/contact?ref=flyer",
    label: "Flyers — books a consultation, tagged as a flyer lead",
  },
  {
    file: "consultation-card",
    path: "/contact?ref=card",
    label: "Business cards",
  },
  {
    file: "consultation-van",
    path: "/contact?ref=van",
    label: "Vehicle wrap / magnets",
  },
  {
    file: "consultation-yard",
    path: "/contact?ref=yard",
    label: "Yard signs at completed jobs",
  },
];

const options = {
  errorCorrectionLevel: "M",
  margin: 4,
  color: { dark: "#000000", light: "#FFFFFF" },
};

mkdirSync(OUT, { recursive: true });

console.log("Generating QR codes\n");

for (const target of TARGETS) {
  const url = `${DOMAIN}${target.path}`;

  const svg = await QRCode.toString(url, { ...options, type: "svg" });
  writeFileSync(join(OUT, `${target.file}.svg`), svg);

  // 2048px so a 2-inch printed code lands near 1000 DPI — far above the
  // 300 DPI a commercial printer needs, with room to scale up.
  await QRCode.toFile(join(OUT, `${target.file}.png`), url, {
    ...options,
    width: 2048,
  });

  console.log(`  ${target.file}`);
  console.log(`    ${url}`);
  console.log(`    ${target.label}\n`);
}

console.log(`Written to ${OUT}/ — use the .svg for print.`);
