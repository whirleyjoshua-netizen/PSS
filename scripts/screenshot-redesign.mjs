// Full-page screenshots of the redesigned pages for the owner's review.
// Usage: BASE=http://localhost:3200 [OUT=<dir>] node scripts/screenshot-redesign.mjs
// Without OUT it writes to a fresh directory under the system temp dir and prints where.
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), "screenshot-redesign-"));
mkdirSync(OUT, { recursive: true });
const PAGES = ["/shades", "/motorization", "/blinds", "/shades/roller-shades", "/shades/solar-shades"];
const SIZES = [["desktop", 1440, 900], ["phone", 390, 844]];

const browser = await chromium.launch();
try {
  for (const [name, width, height] of SIZES) {
    const page = await browser.newPage({ viewport: { width, height } });
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      // Scroll through once so scroll-revealed blocks are shown, then back to the top.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
        // A fast scroll can outrun the reveal observer; show every revealed block for the picture.
        document.querySelectorAll("[data-reveal]").forEach((el) => { el.dataset.reveal = "shown"; });
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${path.slice(1).replaceAll("/", "-")}-${name}.png`), fullPage: true });
    }
    await page.close();
  }
  console.log(`Screenshots written to ${OUT}`);
} finally {
  await browser.close();
}
