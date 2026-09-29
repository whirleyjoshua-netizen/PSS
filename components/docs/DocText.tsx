import type { ReactNode } from "react";
import type { Block, Inline } from "@/lib/docs/types";

/**
 * The React renderer for doc text (spec §2). Template text is untrusted: every string becomes a
 * React text node inside a fixed element, so nothing a template contains can run in a browser.
 * Never use dangerouslySetInnerHTML here.
 */
function Inlines({ inlines, highlightFields }: { inlines: Inline[]; highlightFields: boolean }) {
  return (
    <>
      {inlines.map((inline, index) => {
        const content = inline.type === "text" ? inline.text : `{{${inline.key}}}`;
        const node: ReactNode = inline.type === "field" && highlightFields
          ? <mark className="bg-champagne/30 px-0.5 text-charcoal">{content}</mark>
          : content;
        return inline.bold ? <strong key={index}>{node}</strong> : <span key={index}>{node}</span>;
      })}
    </>
  );
}

export function DocText({ blocks, highlightFields = false }: { blocks: Block[]; highlightFields?: boolean }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const inner = <Inlines inlines={block.inlines} highlightFields={highlightFields} />;
          return block.level === 2
            ? <h3 key={index} className="pt-2 text-base font-semibold">{inner}</h3>
            : <h4 key={index} className="pt-1 font-semibold">{inner}</h4>;
        }
        if (block.type === "paragraph") {
          return <p key={index}><Inlines inlines={block.inlines} highlightFields={highlightFields} /></p>;
        }
        return (
          <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}><Inlines inlines={item} highlightFields={highlightFields} /></li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
