# Logo on Paperwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every generated PDF (quote, contract, terms preview, job document) carries the Premier Shade Solutions logo, drawn from one committed master that can't be stretched or silently changed.

**Architecture:** The website mark's geometry moves into `lib/brand/logo-geometry.ts`. A one-off script builds `public/brand/logo-master.pdf`: the lockup and the mark, with Jost glyphs as vector outlines (no font embedded). The script is committed with its output. `lib/pdf/logo.ts` embeds that file's two pages and draws them width-only. The letterhead replaces the plain-text company line on page 1, and a small mark goes on later pages.

**Tech Stack:** pdf-lib 1.x (`embedPdf`, `drawPage`, `drawSvgPath`), @pdf-lib/fontkit (variable Jost instance → glyph paths), vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-02-logo-and-resources-design.md`, Part A.
- Master = the website's light-tone lockup. Colours: charcoal #1E1E1E, taupe #7A7263, champagne #CDB891, sand #E7E1D6, champagne-ink #766028, rim #A8863F for panels with x ≥ 36. PREMIER is Jost 300; SHADE SOLUTIONS is Jost 400.
- `drawLogo` takes a width, never a height.
- Uploaded terms PDF pages are never drawn on.
- Run tests as `npx vitest run --maxWorkers=2`. Lint changed files by path.

---

### Task 1: Geometry moves out of Logo.tsx, with the website unchanged

**Files:** Create `lib/brand/logo-geometry.ts`. Modify `components/brand/Logo.tsx`. Test `tests/brand/logo.test.tsx`.

**Produces:**
- `PANELS: { x; top; bottom; light; dark }[]` (CSS colour strings for the site), `PANEL_WIDTH = 22`, `SHEAR = 6`, `RIM = 2.4`, `MARK_VIEWBOX = { width: 76, height: 106 }`.
- `rimColor(x: number, tone)`.
- `PRINT_COLORS` (hex for each panel and rim).
- `panelPath(panel)` / `rimPath(panel)` returning point lists `[x, y][]`.
- `LOCKUP` ratios: `{ markHeight: 2.05, gap: 0.5, premierTracking: 0.24, subTop: 0.28, subSize: 0.33, subTracking: 0.28, ruleLead: 0.9, ruleGap: 0.4, ruleThickness: 1 / 26 }`.

- [ ] Step 1: Write a snapshot test that renders `<Logo variant="lockup" />` and `<Logo variant="mark" tone="dark" />` and captures every `path[d]` and `fill`. Run it against the **current** Logo.tsx to record the snapshot. Commit the snapshot.
- [ ] Step 2: Move the constants and path builders into `lib/brand/logo-geometry.ts`. Logo.tsx imports them, and its rendered `d` strings are built from the shared point lists.
- [ ] Step 3: The snapshot test still passes unchanged. Commit.

### Task 2: The master file

**Files:**
- Create `lib/pdf/fonts/Jost.ttf` (variable font, google/fonts `ofl/jost/Jost[wght].ttf`) and `lib/pdf/fonts/Jost-OFL.txt`.
- Create `scripts/build-logo-master.ts` and `public/brand/logo-master.pdf`.
- Test `tests/brand/logo-master.test.ts`.

The script, run with `npx tsx scripts/build-logo-master.ts`:
- loads Jost through fontkit, then `getVariation({ wght: 300 })` and `getVariation({ wght: 400 })`;
- lays out the lockup in em units of PREMIER = 100 pt, matching the website's CSS:
  - mark height 2.05em, centred on the wordmark column;
  - gap 0.5em;
  - PREMIER drawn letter by letter, with advance + 0.24em after each letter (the last one included, as CSS does);
  - the baseline inside a line-height-1 box: `(1 − (ascent − descent)/upm)/2 + ascent/upm`, measured down from the top;
  - 0.28em below that box, the sub-row: a 0.9em rule, a 0.4em gap, SHADE SOLUTIONS at 0.33em with 0.28 × 0.33em tracking, a 0.4em gap, then a rule out to the column's width;
  - rules 1/26em thick, champagne-ink at opacity 0.8;
- draws glyphs as `drawSvgPath` from the glyph path commands, with y flipped into SVG space;
- gives page 1 (the lockup) and page 2 (the mark alone) MediaBoxes at the tight artwork bounds;
- sets the PDF metadata title "Premier Shade Solutions logo", and fixed CreationDate/ModDate (2026-10-02T00:00:00Z) and producer, so a rebuild is byte-identical.

- [ ] Step 1: Failing test:
  - the file exists, has 2 pages, and page 1 is wider than tall;
  - the SHA-256 equals the pinned value;
  - rerunning the build in memory (export `buildLogoMaster(): Promise<Uint8Array>` from a lib module that the script calls, `lib/brand/build-logo-master.ts`) produces the same bytes.
- [ ] Step 2: Implement `lib/brand/build-logo-master.ts` and the thin `scripts/build-logo-master.ts`. Run the script, then render page 1 with qlmanage and check it by eye against the website's lockup.
- [ ] Step 3: Pin the hash and commit.

### Task 3: `lib/pdf/logo.ts`

**Interfaces (produces):**
```ts
export type EmbeddedLogo = { lockup: PDFEmbeddedPage; mark: PDFEmbeddedPage };
export async function embedLogo(doc: PDFDocument): Promise<EmbeddedLogo>;           // reads public/brand/logo-master.pdf once per process
export function drawLogo(page: PDFPage, art: PDFEmbeddedPage, at: { x: number; top: number; width: number }): { width: number; height: number };
export const LETTERHEAD_WIDTH = 170;
export const MARK_HEIGHT = 22;
/** Page 1 top-left: lockup, then legal name and phone · email in 8.5pt. Returns the y the content starts at. */
export function drawLetterhead(page: PDFPage, logo: EmbeddedLogo, font: PDFFont): number;
/** Top-right mark on every page after the first, except `skip`. */
export function markLaterPages(doc: PDFDocument, logo: EmbeddedLogo, skip?: ReadonlySet<PDFPage>): void;
```
- [ ] Step 1: Failing tests:
  - for widths 40, 170 and 333, the drawn height/width equals the master page's height/width (spy on `PDFPage.prototype.drawPage`);
  - the letterhead draws the lockup at `MARGIN`, with its top at `LETTER[1] − MARGIN`, and the legal name and contact line below it;
  - `markLaterPages` puts the mark on pages 2..n, not page 1 and not skipped pages, with its bottom ≥ `LETTER[1] − MARGIN + 4` (inside the top margin).
- [ ] Step 2: Implement it, then commit.

### Task 4: Wire it into every PDF

**Files:** Modify `lib/dc/contract-pdf.ts` (`drawPricedPages`, `renderContractPdf`, `buildTermsPdf`), `lib/dc/quote-pdf.ts` and `lib/docs/pdf.ts` (`renderDocumentPdf`). Tests: `tests/dc/quote-pdf.test.ts`, `tests/dc/contract.test.ts`, `tests/docs/pdf*.test.ts`.

- `drawPricedPages` becomes async or takes an `EmbeddedLogo`. Callers embed the logo once and pass it in. The `text(business.legalName…)` and phone lines are replaced by `y = drawLetterhead(...)`, and the date is drawn top-right at the logo's top.
- `renderDocumentPdf` gets the same treatment: its two `drawLines` header calls become `drawLetterhead`.
- After everything is drawn, each builder calls `markLaterPages(doc, logo, skip)`. The contract's skip set holds the copied uploaded-terms pages. `buildTermsPdf` has no letterhead, so it marks every page, page 1 included, via `markLaterPages` plus `drawLogo` of the mark on page 1.
- [ ] Step 1: Failing tests:
  - per builder, page 1 draws the lockup once and every later page the mark once;
  - an uploaded-terms contract leaves the copied pages unmarked;
  - the existing "quote and contract page 1 positions match" test still passes;
  - nothing but the mark draws above `LETTER[1] − MARGIN`.
- [ ] Step 2: Implement, update any hard-coded y expectations the moved header breaks (each one checked, not blindly re-recorded), and run the full suite, `tsc` and eslint on the changed files.
- [ ] Step 3: Render a quote, a contract with typed terms, and a job document to PNG, and check them by eye. Commit.
