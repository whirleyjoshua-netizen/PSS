import Image from "next/image";
import { Section, Eyebrow } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { FabricPanel } from "./FabricPanel";
import type { Photo } from "@/content/products";

/**
 * Big serif heading and the page's existing paragraphs beside a photo (or the
 * fabric panel) with a small caption card floating on it (spec 2026-10-01 §3.4).
 */
export function StorySection({
  eyebrow,
  heading,
  paragraphs,
  photo,
  panelLabel,
  caption,
}: {
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  photo?: Photo;
  panelLabel: string;
  caption: { eyebrow: string; line: string };
}) {
  return (
    <Section tone="ivory">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-6">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="heading-serif text-4xl leading-[1.1] text-charcoal md:text-5xl">{heading}</h2>
          <div className="flex max-w-[65ch] flex-col gap-5 text-lg leading-relaxed text-ink-soft">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>
          <div>
            <ButtonLink href="/about">Meet the family</ButtonLink>
          </div>
        </div>

        <div className="relative">
          {photo ? (
            <div className="relative aspect-4/5 w-full overflow-hidden bg-sand">
              <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
            </div>
          ) : (
            <FabricPanel label={panelLabel} className="aspect-4/5 w-full" />
          )}
          <Reveal delayMs={150} className="relative -mt-16 ml-auto mr-4 max-w-xs sm:mr-8 lg:absolute lg:bottom-8 lg:right-8 lg:m-0">
            <div className="flex flex-col gap-3 bg-ivory p-6 shadow-xl">
              <Eyebrow>{caption.eyebrow}</Eyebrow>
              <span aria-hidden="true" className="h-px w-8 bg-champagne" />
              <p className="text-base leading-relaxed text-charcoal">{caption.line}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
