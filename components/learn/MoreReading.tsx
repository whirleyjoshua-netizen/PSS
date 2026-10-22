import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { articlesFor } from "@/content/articles";

/** Links from a product or category page to the buying guides about it (content/articles.ts). Nothing when none. */
export function MoreReading({ path }: { path: string }) {
  const list = articlesFor(path);
  if (list.length === 0) return null;
  return (
    <Section tone="ivory" containerWidth="prose" className="!pt-0">
      <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">Buying guides</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {list.map((article) => (
          <li key={article.slug}>
            <Link href={`/learn/${article.slug}`} className="block border border-rule bg-white px-4 py-3 font-display text-charcoal transition-colors hover:border-champagne">
              {article.title} →
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
