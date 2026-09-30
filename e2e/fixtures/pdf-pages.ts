import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream, type PDFObject } from "pdf-lib";

export type DrawnRun = { font: string; text: string };
export type DrawnPage = { runs: DrawnRun[]; images: number };

/**
 * What pdf-lib drew on each page: every `Tj` run with the base name of the font that drew it, and
 * the number of image draws (`Do`). A run in an embedded font is decoded through that font's
 * ToUnicode CMap (pdf-lib writes `<glyph> <unicode>` pairs in one beginbfchar block), so
 * handwritten text reads back as text. A run in a standard font is decoded as Latin-1, as pdfText does.
 * Only for PDFs pdf-lib wrote: this is not a general PDF parser.
 */
export async function pdfPages(bytes: Uint8Array): Promise<DrawnPage[]> {
  const pdf = await PDFDocument.load(bytes);
  const decode = (object: PDFObject | undefined): string => {
    const stream = object instanceof PDFRef ? pdf.context.lookup(object) : object;
    return Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1");
  };

  return pdf.getPages().map((page) => {
    // Resource key ("/GreatVibes-Regular-4812930311") -> base name and, for an embedded font, its glyph map.
    const fonts = new Map<string, { name: string; glyphs: Map<string, string> | null }>();
    const fontDict = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    for (const [key, ref] of fontDict?.entries() ?? []) {
      const dict = pdf.context.lookup(ref, PDFDict);
      const toUnicode = dict.get(PDFName.of("ToUnicode"));
      let glyphs: Map<string, string> | null = null;
      if (toUnicode) {
        glyphs = new Map();
        const block = /beginbfchar([\s\S]*?)endbfchar/.exec(decode(toUnicode))?.[1] ?? "";
        for (const [, glyph, unicode] of block.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g)) {
          const units = (unicode.match(/.{4}/g) ?? []).map((hex) => parseInt(hex, 16));
          glyphs.set(glyph.toLowerCase(), String.fromCharCode(...units));
        }
      }
      fonts.set(key.asString(), { name: key.asString().replace(/^\//, "").replace(/-\d+$/, ""), glyphs });
    }

    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const runs: DrawnRun[] = [];
    let images = 0;
    let current: { name: string; glyphs: Map<string, string> | null } = { name: "", glyphs: null };
    for (const source of streams.map(decode)) {
      for (const [, fontKey, hex, xobject] of source.matchAll(/(\/[^\s/<>[\]()]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\/[^\s/<>[\]()]+\s+(Do)\b/g)) {
        if (fontKey) current = fonts.get(fontKey) ?? { name: fontKey.slice(1), glyphs: null };
        else if (xobject) images++;
        else if (hex !== undefined) {
          const glyphs = current.glyphs;
          const text = glyphs
            ? (hex.match(/.{4}/g) ?? []).map((glyph) => glyphs.get(glyph.toLowerCase()) ?? "�").join("")
            : Buffer.from(hex, "hex").toString("latin1");
          runs.push({ font: current.name, text });
        }
      }
    }
    return { runs, images };
  });
}
