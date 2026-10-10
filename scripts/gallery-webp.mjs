/**
 * Converts full-resolution job photos in Images/ (gitignored) into 1800px-wide
 * WebP under public/gallery/. Usage: node scripts/gallery-webp.mjs
 *
 * sharp drops EXIF by default, which matters here: phone photos carry GPS
 * coordinates, and on a job photo that is a customer's home address.
 * `.rotate()` bakes the camera orientation into the pixels before the EXIF
 * that described it is dropped.
 */
import sharp from "sharp";
import { existsSync } from "node:fs";

/** source file in Images/ -> output name in public/gallery/ */
const PHOTOS = {
  "IMG_0454.jpeg": "cellular-shades-kitchen-door",
  "IMG_1827.jpeg": "cellular-shades-entry-sidelights",
  "IMG_2033.jpeg": "cellular-shades-fireplace-wall",
  "IMG_2082.JPG": "cellular-shades-holiday-great-room",
  "IMG_2309.jpeg": "plantation-shutters-bedroom",
  "IMG_2312.jpeg": "shades-open-living-room",
  "IMG_2324.jpeg": "cellular-shades-top-down-bedroom",
  "IMG_2358.jpeg": "faux-wood-blinds-living-room",
  "IMG_2411.jpeg": "roller-shade-lake-view",
  "IMG_2424.jpeg": "roller-shades-bay-window",
  "IMG_2425.jpeg": "roller-shades-curved-bay",
  "IMG_2442.jpeg": "plantation-shutters-french-doors",
  "IMG_3794.jpeg": "plantation-shutters-dining-room",
};

for (const [source, name] of Object.entries(PHOTOS)) {
  const out = `public/gallery/${name}.webp`;
  if (existsSync(out)) {
    console.log(`skip  ${out} (exists)`);
    continue;
  }

  const image = sharp(`Images/${source}`).rotate();
  // metadata() reports the stored pixels, before .rotate() applies; EXIF
  // orientations 5-8 are quarter turns, so the displayed shape is swapped.
  const { width = 0, height = 0, orientation = 1 } = await image.metadata();
  const portrait = orientation >= 5 ? width > height : height > width;

  // The gallery frames every photo at 4:3, so a portrait shot is cropped to
  // landscape here rather than letting the browser crop it unpredictably.
  const info = await image
    .resize(portrait ? { width: 1800, height: 1350, fit: "cover" } : { width: 1800, withoutEnlargement: true })
    .webp({ quality: 78, effort: 5 })
    .toFile(out);

  console.log(`wrote ${out}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
}
