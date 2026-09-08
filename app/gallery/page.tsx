import type { Metadata } from "next";
import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { PageHero, ConsultationCta } from "@/components/product/ProductParts";
import { ButtonLink } from "@/components/ui/Button";
import { gallery } from "@/content/gallery";

export const metadata: Metadata = {
  title: "Gallery | Premier Shade Solutions",
  description:
    "Blinds, shades, and shutters installed in homes across Las Vegas, Henderson, Summerlin, and North Las Vegas.",
  alternates: { canonical: "/gallery" },
};

export default function GalleryPage() {
  return (
    <>
      <PageHero
        eyebrow="Our work"
        title="Installed across the valley"
        lead="Real jobs in real Las Vegas homes — no stock photography."
        trail={[{ name: "Gallery", url: "/gallery" }]}
      />

      <Section tone="ivory">
        {gallery.length === 0 ? (
          <div className="flex max-w-xl flex-col gap-5">
            <p className="text-lg text-ink-soft">
              We are photographing recent installations now, and this page will
              fill up shortly. We would rather show you nothing than show you
              someone else&rsquo;s work.
            </p>
            <p className="text-ink-soft">
              In the meantime, we are glad to walk you through completed jobs in
              person at your consultation, and to put you in touch with recent
              customers nearby.
            </p>
            <div className="pt-2">
              <ButtonLink href="/contact">Book a consultation</ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((item) => (
              <li key={item.src} className="flex flex-col gap-3">
                <div className="relative aspect-4/3 overflow-hidden bg-sand">
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                {item.caption ? (
                  <p className="text-sm text-ink-soft">{item.caption}</p>
                ) : null}
                <p className="font-display text-xs uppercase tracking-[0.16em] text-ink-soft">
                  {item.city}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ConsultationCta />
    </>
  );
}
