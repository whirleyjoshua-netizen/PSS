import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, rgb, type PDFPage } from "pdf-lib";
import { LOCKUP, MARK_VIEWBOX, PANELS, panelPoints, pathData, rimColor, rimPoints, type Point } from "./logo-geometry";

/**
 * Builds the print master, public/brand/logo-master.pdf: page 1 the light-tone lockup, page 2 the mark.
 * Everything is vector and every letter is an outline, so no font travels with it and nothing a PDF
 * reader substitutes can change it. Run by scripts/build-logo-master.ts, never at runtime.
 */

/** PREMIER's font size in the master. Any size works; every PDF scales the page to the width it needs. */
const EM = 100;
/** Fixed, so a rebuild from the same inputs is byte-for-byte the same file. */
const FIXED_DATE = new Date("2026-10-02T00:00:00Z");

type Glyph = { path: { commands: { command: string; args: number[] }[] } };
type Laid = { glyphs: Glyph[]; positions: { xAdvance: number }[] };
type Face = { unitsPerEm: number; ascent: number; descent: number; layout(text: string): Laid };
type VariableFont = Face & { getVariation(axes: Record<string, number>): Face };

/** "#RRGGBB" as a pdf-lib colour. */
const color = (hex: string) => rgb(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]));

/** A glyph's outline as an SVG path (y down) in points, from its baseline origin. */
function glyphPath(glyph: Glyph, k: number): string {
  const p = (x: number, y: number) => `${x * k} ${-y * k}`;
  return glyph.path.commands.map(({ command, args: a }) => {
    switch (command) {
      case "moveTo": return `M${p(a[0], a[1])}`;
      case "lineTo": return `L${p(a[0], a[1])}`;
      case "quadraticCurveTo": return `Q${p(a[0], a[1])} ${p(a[2], a[3])}`;
      case "bezierCurveTo": return `C${p(a[0], a[1])} ${p(a[2], a[3])} ${p(a[4], a[5])}`;
      case "closePath": return "Z";
      default: throw new Error(`Unknown glyph command ${command}`);
    }
  }).join(" ");
}

/** A run's width as CSS lays it out: each glyph's advance plus `tracking` after every letter, the last included. */
function runWidth(face: Face, text: string, size: number, tracking: number): number {
  return face.layout(text).positions.reduce((w, pos) => w + (pos.xAdvance / face.unitsPerEm) * size + tracking, 0);
}

/** Where the baseline sits below the top of a line-height-1 box of `size`, as a browser centres the font's ascent and descent. */
function baselineDrop(face: Face, size: number): number {
  const content = (face.ascent - face.descent) / face.unitsPerEm;
  return size * ((1 - content) / 2 + face.ascent / face.unitsPerEm);
}

/** Draws a run with its baseline at pdf y `baseline`, starting at x. */
function drawRun(page: PDFPage, face: Face, text: string, at: { x: number; baseline: number }, size: number, tracking: number, hex: string) {
  const k = size / face.unitsPerEm;
  const laid = face.layout(text);
  let x = at.x;
  laid.glyphs.forEach((glyph, i) => {
    const d = glyphPath(glyph, k);
    if (d) page.drawSvgPath(d, { x, y: at.baseline, color: color(hex), borderWidth: 0 });
    x += laid.positions[i].xAdvance * k + tracking;
  });
}

/** The mark at `scale` points per viewBox unit, its upper-left corner at pdf (x, top). */
function drawMark(page: PDFPage, x: number, top: number, scale: number) {
  const scaled = (points: Point[]): Point[] => points.map(([px, py]) => [px * scale, py * scale]);
  for (const panel of PANELS) {
    page.drawSvgPath(pathData(scaled(panelPoints(panel))), { x, y: top, color: color(panel.print), borderWidth: 0 });
    page.drawSvgPath(pathData(scaled(rimPoints(panel))), { x, y: top, color: color(rimColor(panel, "print")), borderWidth: 0 });
  }
}

export async function buildLogoMaster(jostTtf: Uint8Array): Promise<Uint8Array> {
  const jost = fontkit.create(jostTtf) as unknown as VariableFont;
  const light = jost.getVariation({ wght: LOCKUP.premierWeight });
  const regular = jost.getVariation({ wght: LOCKUP.subWeight });

  // The lockup, measured in points from its top-left corner.
  const markH = LOCKUP.markHeight * EM;
  const markScale = markH / MARK_VIEWBOX.height;
  const markW = MARK_VIEWBOX.width * markScale;
  const columnX = markW + LOCKUP.gap * EM;
  const premierW = runWidth(light, "PREMIER", EM, LOCKUP.premierTracking * EM);
  const subSize = LOCKUP.subSize * EM;
  const subTracking = LOCKUP.subTracking * subSize;
  const subW = runWidth(regular, "SHADE SOLUTIONS", subSize, subTracking);
  const columnH = EM + LOCKUP.subTop * EM + subSize;
  // items-center: the column is centred beside the taller mark.
  const columnTop = (markH - columnH) / 2;
  const leadW = LOCKUP.ruleLead * EM;
  const gap = LOCKUP.ruleGap * EM;
  // A flex column is as wide as its widest row. The sub-row's trailing rule is flex-1 (basis 0), so the
  // row's own width is lead + gap + text + gap; at these ratios that is wider than PREMIER, and the
  // trailing rule gets no width — exactly as the website draws it (measured on the live header).
  const columnW = Math.max(premierW, leadW + gap + subW + gap);
  const width = columnX + columnW;
  const height = markH;

  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle("Premier Shade Solutions logo");
  doc.setProducer("scripts/build-logo-master.ts");
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.catalog.set(PDFName.of("Lang"), PDFString.of("en"));

  const lockup = doc.addPage([width, height]);
  const y = (fromTop: number) => height - fromTop;
  drawMark(lockup, 0, y(0), markScale);
  drawRun(lockup, light, "PREMIER", { x: columnX, baseline: y(columnTop + baselineDrop(light, EM)) }, EM, LOCKUP.premierTracking * EM, LOCKUP.ink);

  const rowTop = columnTop + EM + LOCKUP.subTop * EM;
  const rowMid = rowTop + subSize / 2;
  const rule = LOCKUP.ruleThickness * EM;
  const drawRule = (x: number, w: number) => {
    if (w > 0.01) lockup.drawRectangle({ x, y: y(rowMid) - rule / 2, width: w, height: rule, color: color(LOCKUP.accent), opacity: LOCKUP.ruleOpacity });
  };
  drawRule(columnX, leadW);
  const subX = columnX + leadW + gap;
  drawRun(lockup, regular, "SHADE SOLUTIONS", { x: subX, baseline: y(rowTop + baselineDrop(regular, subSize)) }, subSize, subTracking, LOCKUP.accent);
  const tailX = subX + subW + gap;
  drawRule(tailX, width - tailX);

  const mark = doc.addPage([MARK_VIEWBOX.width, MARK_VIEWBOX.height]);
  drawMark(mark, 0, MARK_VIEWBOX.height, 1);

  return doc.save({ useObjectStreams: false });
}
