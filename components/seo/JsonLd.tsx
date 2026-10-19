/**
 * Renders a JSON-LD block. The payload comes from our own typed content model, but a "</script>" anywhere in
 * it (a review, an answer) would still end the tag early, so every "<" is written as <, which JSON
 * parsers read back as "<" (the same escape lib/promo.ts uses for its inline scripts).
 */
export const serializeJsonLd = (schema: object) => JSON.stringify(schema).replace(/</g, "\\u003c");

export function JsonLd({ schema }: { schema: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}
