// Writes the PSS Ops home-screen icons from app/icon.svg.
// Run: node scripts/ops-icons.mjs — then commit public/ops/*.png.
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "app/icon.svg"));
const out = join(root, "public/ops");
mkdirSync(out, { recursive: true });

// The SVG is 32x32; render it dense enough that 512px stays sharp.
const render = (size) => sharp(svg, { density: Math.ceil((72 * size) / 32) }).resize(size, size).png();

// Full bleed: iOS rounds the corners itself, and the SVG already fills its square with #1E1E1E.
for (const size of [180, 192, 512]) {
  await render(size).toFile(join(out, `icon-${size}.png`));
}

// Maskable: the mark at 80% inside a #1E1E1E square, so a circle mask doesn't clip it.
const inner = Math.round(512 * 0.8);
const offset = Math.round((512 - inner) / 2);
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#1E1E1E" } })
  .composite([{ input: await render(inner).toBuffer(), left: offset, top: offset }])
  .png()
  .toFile(join(out, "icon-maskable-512.png"));

for (const name of ["icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
  const { width, height, format } = await sharp(join(out, name)).metadata();
  console.log(`${name}: ${width}x${height} ${format}`);
}
