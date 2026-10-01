import { Section } from "@/components/ui/Section";
import { LineIcon } from "@/components/ui/LineIcon";
import type { Highlight } from "@/content/products";

/** Four short reasons, each with a line icon (spec 2026-10-01 §3.3). */
export function IconRow({ items }: { items: Highlight[] }) {
  return (
    <Section tone="ivory" className="!py-10 md:!py-14">
      <ul aria-label="Highlights" className="grid grid-cols-2 gap-px bg-rule md:grid-cols-4">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col items-center gap-3 bg-ivory px-4 py-6 text-center">
            <LineIcon name={item.icon} className="size-8" />
            <span className="font-display text-xs font-medium uppercase tracking-[0.16em] text-charcoal">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
