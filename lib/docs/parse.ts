import { markerPattern } from "./fields";
import type { Block, Inline } from "./types";

/** Splits one bold-or-not piece into text and `{{field}}` runs. Empty text is dropped. */
function pushPieces(out: Inline[], text: string, bold: boolean): void {
  let last = 0;
  for (const match of text.matchAll(markerPattern())) {
    if (match.index > last) out.push({ type: "text", text: text.slice(last, match.index), bold });
    out.push({ type: "field", key: match[1].trim(), bold });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last), bold });
}

/** Adjacent text runs of the same weight become one. */
function merge(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const inline of inlines) {
    const prev = out[out.length - 1];
    if (inline.type === "text" && prev?.type === "text" && prev.bold === inline.bold) prev.text += inline.text;
    else out.push({ ...inline });
  }
  return out;
}

/**
 * `**bold**` pairs first, then `{{field}}` markers inside each piece. `**` marks pair from the
 * left; an unmatched last one stays literal, joined back onto the text after it.
 */
export function parseInline(text: string): Inline[] {
  const parts = text.split("**");
  const paired = parts.length % 2 === 1 ? parts : [...parts.slice(0, -2), parts.slice(-2).join("**")];
  const out: Inline[] = [];
  paired.forEach((part, index) => pushPieces(out, part, index % 2 === 1));
  return merge(out);
}

/**
 * Doc text (spec §2) into blocks. Lines are trimmed, so an indented bullet is still a bullet:
 * lists are one level deep. Consecutive plain lines join into one paragraph with a space.
 * Anything outside the grammar is literal text; nothing here can produce markup.
 */
export function parseDocText(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: Inline[][] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", inlines: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length > 0) blocks.push({ type: "bullets", items: bullets });
    bullets = [];
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flushParagraph();
      flushBullets();
      continue;
    }
    const heading = /^(#{2,3}) (.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushBullets();
      blocks.push({ type: "heading", level: heading[1].length === 2 ? 2 : 3, inlines: parseInline(heading[2].trim()) });
      continue;
    }
    const bullet = /^- (.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(parseInline(bullet[1].trim()));
      continue;
    }
    flushBullets();
    paragraph.push(line);
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

const unique = (values: string[]): string[] => [...new Set(values)];

/** Every marker's trimmed key, once each, in order of first appearance. */
export const findFieldKeys = (text: string): string[] =>
  unique([...text.matchAll(markerPattern())].map((match) => match[1].trim()));

/** The keys used in `text` that `allowed` does not contain. */
export const unknownFields = (text: string, allowed: readonly string[]): string[] =>
  findFieldKeys(text).filter((key) => !allowed.includes(key));

/** The markers still in `text`, exactly as written, once each. Send is blocked while any remain. */
export const remainingMarkers = (text: string): string[] =>
  unique([...text.matchAll(markerPattern())].map((match) => match[0]));
