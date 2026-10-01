import type { Metadata } from "next";
import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { PageHero, ConsultationCta } from "@/components/product/ProductParts";
import { ButtonLink } from "@/components/ui/Button";
import { gallery } from "@/content/gallery";

export const metadata: Metadata = {
  title: "Gallery | Premier Shade Solutions",
  description:
    "Blinds, shades, and shutters we measured and installed — real jobs, photographed on site.",
  alternates: { canonical: "/gallery" },
};

export default function GalleryPage() {
  return (
    <>
      <PageHero
        eyebrow="Our work"
        title="Our installations"
        lead="Our own work, photographed on site — no stock photography. Most of these are from our years in Ohio, before we moved home to Las Vegas."
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
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:gap-5">
              <ButtonLink href="/contact">Invite Us Over</ButtonLink>
              <p className="text-sm text-ink-soft">Free in-home consultation. No charge, no obligation.</p>
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
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ConsultationCta />
    </>
  );
}
