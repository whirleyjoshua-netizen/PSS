/**
 * Renders a JSON-LD block. The payload is serialized by JSON.stringify from
 * our own typed content model — never from user input — so there is no
 * injection surface here.
 */
export function JsonLd({ schema }: { schema: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
