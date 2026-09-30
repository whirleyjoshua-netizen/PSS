import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFObject } from "pdf-lib";

export type DrawnRun = { font: string; text: string };
export type DrawnPage = { runs: DrawnRun[]; images: number };

type Font = { name: string; glyphs: Map<string, string> | null };

// Content-stream tokens: dict delimiters, a hex string, the start of a literal string, a name, an operator
// (letters, ' or "), anything else (numbers, array brackets) as an operand. Whitespace is skipped.
const TOKEN = /<<|>>|<([0-9A-Fa-f\s]*)>|(\()|(\/[^\s/<>[\]()%]+)|([A-Za-z'"*]+)|([^\s<>()/]+)/g;

/**
 * What pdf-lib drew on each page: every `Tj` run with the base name of the font that drew it, and
 * the number of image draws (`Do` of an XObject whose Subtype is /Image; a drawn form XObject is not counted).
 * A run in an embedded font is decoded through that font's ToUnicode CMap (pdf-lib writes
 * `<glyph> <unicode>` pairs in one beginbfchar block), so handwritten text reads back as text.
 * A run in a standard font is decoded as Latin-1, as pdfText does: WinAnsi punctuation (curly quotes,
 * dashes, the bullet) therefore reads back as C1 control characters (U+0080 to U+009F), not as the drawn glyph.
 *
 * Only for PDFs pdf-lib wrote: this is not a general PDF parser. It throws on anything it cannot read
 * rather than skipping it, so a test asserting a run or a count is absent cannot pass vacuously: a Tj with
 * no current font, a Tf naming a font the page lacks, a Do naming an XObject the page lacks, an embedded-font
 * glyph with no ToUnicode mapping, a literal string, and the TJ, ' and " text operators.
 */
export async function pdfPages(bytes: Uint8Array): Promise<DrawnPage[]> {
  const pdf = await PDFDocument.load(bytes);
  const decode = (object: PDFObject | undefined): string => {
    const stream = object instanceof PDFRef ? pdf.context.lookup(object) : object;
    return Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1");
  };

  return pdf.getPages().map((page, index) => {
    const where = `page ${index + 1}`;
    const resources = page.node.Resources();

    // Resource key ("/GreatVibes-Regular-4812930311") -> base name and, for an embedded font, its glyph map.
    const fonts = new Map<string, Font>();
    for (const [key, ref] of resources?.lookupMaybe(PDFName.of("Font"), PDFDict)?.entries() ?? []) {
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

    // XObject key -> whether it is an image.
    const xobjects = new Map<string, boolean>();
    for (const [key, ref] of resources?.lookupMaybe(PDFName.of("XObject"), PDFDict)?.entries() ?? []) {
      const object = ref instanceof PDFRef ? pdf.context.lookup(ref) : ref;
      xobjects.set(key.asString(), object instanceof PDFStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
    }

    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const runs: DrawnRun[] = [];
    let images = 0;
    let current: Font | null = null;
    for (const source of streams.map(decode)) {
      let operands: string[] = [];
      for (const [token, hex, literal, name, operator] of source.matchAll(TOKEN)) {
        if (literal) throw new Error(`pdfPages: ${where} has a literal string, which it does not read`);
        if (hex !== undefined) operands.push(`<${hex.replace(/\s/g, "")}>`);
        else if (name) operands.push(name);
        else if (operator) {
          if (operator === "TJ" || operator === "'" || operator === '"') {
            throw new Error(`pdfPages: ${where} uses unsupported text operator ${operator}`);
          }
          if (operator === "Tf") {
            const key = operands.at(-2) ?? "";
            const font = fonts.get(key);
            if (!font) throw new Error(`pdfPages: ${where} sets a font not in the page's fonts: ${key}`);
            current = font;
          } else if (operator === "Tj") {
            if (!current) throw new Error(`pdfPages: ${where} has a Tj with no current font`);
            const operand = operands.at(-1) ?? "";
            if (!/^<[0-9A-Fa-f]*>$/.test(operand)) throw new Error(`pdfPages: ${where} has a Tj without a hex string`);
            runs.push({ font: current.name, text: showText(current, operand.slice(1, -1), where) });
          } else if (operator === "Do") {
            const key = operands.at(-1) ?? "";
            const image = xobjects.get(key);
            if (image === undefined) throw new Error(`pdfPages: ${where} draws an XObject not in the page's XObjects: ${key}`);
            if (image) images++;
          }
          operands = [];
        } else if (token !== "<<" && token !== ">>") operands.push(token);
      }
    }
    return { runs, images };
  });
}

function showText(font: Font, hex: string, where: string): string {
  const glyphs = font.glyphs;
  if (!glyphs) return Buffer.from(hex, "hex").toString("latin1");
  if (hex.length % 4 !== 0) throw new Error(`pdfPages: ${where} has a ${font.name} run that is not whole 2-byte glyphs`);
  return (hex.match(/.{4}/g) ?? [])
    .map((glyph) => {
      const text = glyphs.get(glyph.toLowerCase());
      if (text === undefined) throw new Error(`pdfPages: ${where} has no ToUnicode mapping for glyph ${glyph.toLowerCase()} in ${font.name}`);
      return text;
    })
    .join("");
}
