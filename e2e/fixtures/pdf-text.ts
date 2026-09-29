import { inflateSync } from "node:zlib";

/**
 * The strings pdf-lib drew into a PDF: each content stream inflated, each `<hex> Tj` decoded. Enough
 * to prove which words a generated PDF carries (pdf-lib writes one Tj per drawText); it is not a
 * general PDF parser and is not meant for PDFs made by anything else.
 */
export function pdfText(bytes: Buffer): string[] {
  const source = bytes.toString("latin1");
  const out: string[] = [];
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body = Buffer.from(match[1], "latin1");
    try {
      body = inflateSync(body);
    } catch {
      // Not compressed: read as is.
    }
    for (const text of body.toString("latin1").matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
      out.push(Buffer.from(text[1], "hex").toString("latin1"));
    }
  }
  return out;
}
