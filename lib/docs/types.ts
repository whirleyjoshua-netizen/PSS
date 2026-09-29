/**
 * The parsed form of "doc text" (spec §2). The parser produces it; the PDF and React renderers
 * consume it and nothing else. Types only: safe to import anywhere, including client components.
 */
export type Inline =
  | { type: "text"; text: string; bold: boolean }
  /** A `{{key}}` marker. `key` is trimmed; it may not be a real field (the validator reports those). */
  | { type: "field"; key: string; bold: boolean };

export type Block =
  | { type: "heading"; level: 2 | 3; inlines: Inline[] }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "bullets"; items: Inline[][] };
