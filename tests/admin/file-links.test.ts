import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// In the home-screen app a same-tab file link strands the owner on a PDF with no back button.
// target="_blank" makes iOS open it in a sheet over the app, which they can swipe away.
const HREF = "href={`/admin/files/";

function fileLinks(): { file: string; tag: string }[] {
  const found: { file: string; tag: string }[] = [];
  const files = readdirSync("app/admin", { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".tsx"));
  for (const name of files) {
    const file = join("app/admin", name);
    const source = readFileSync(file, "utf8");
    for (let at = source.indexOf(HREF); at !== -1; at = source.indexOf(HREF, at + 1)) {
      const start = source.lastIndexOf("<a", at);
      const end = source.indexOf(">", at);
      found.push({ file, tag: source.slice(start, end + 1) });
    }
  }
  return found;
}

describe("admin file links", () => {
  it("open every /admin/files/ link in a new tab, so the iPhone app shows it in a sheet", () => {
    const links = fileLinks();
    // Seven today. The floor stops a broken glob from passing on zero.
    expect(links.length).toBeGreaterThanOrEqual(7);
    for (const { file, tag } of links) expect(tag, file).toContain('target="_blank"');
  });
});
