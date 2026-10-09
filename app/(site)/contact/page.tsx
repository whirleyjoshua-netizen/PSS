import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/product/ProductParts";
import { ConsultationForm } from "@/components/forms/ConsultationForm";
import { business } from "@/content/business";
import { cityPath } from "@/lib/content/cities";

export const metadata: Metadata = {
  title: "Book a Free Consultation | Premier Shade Solutions",
  description:
    "Book a free in-home window treatment consultation in Las Vegas, Henderson, Summerlin, or North Las Vegas. We measure every window and send you a written quote.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Free in-home consultation"
        title="Let's look at your windows together"
        lead="Tell us a little about the project and we will get you on the schedule. There is no charge and no obligation."
        trail={[{ name: "Contact", url: "/contact" }]}
      />

      <Section tone="ivory">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,64rem)_22rem] lg:gap-16">
          <ConsultationForm />

          <aside className="flex flex-col gap-8">
            <div className="relative aspect-4/5 w-full overflow-hidden bg-sand">
              <Image
                src="/brand/family-backyard-pool.webp"
                alt="Josh and Shade’ smiling by a backyard pool under palm trees, each holding one of their two young children"
                fill
                sizes="(min-width: 1024px) 22rem, 100vw"
                className="object-cover"
              />
            </div>
            <div className="border border-rule bg-sand/50 p-6">
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                Prefer to call?
              </h2>
              <a
                href={business.phone.href}
                className="mt-3 block font-display text-xl text-charcoal underline-offset-4 hover:underline"
              >
                {business.phone.display}
              </a>
              <a
                href={`mailto:${business.email}`}
                className="mt-2 block text-sm text-ink-soft underline-offset-4 hover:underline"
              >
                {business.email}
              </a>
              <p className="mt-4 text-sm text-ink-soft">{business.hours}</p>
            </div>

            <div>
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                Where we work
              </h2>
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                {business.serviceArea.map((city) => (
                  <li key={city}>
                    <Link
                      href={cityPath(city)}
                      className="text-ink-soft transition-colors hover:text-charcoal"
                    >
                      {city}, NV
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-ink-soft">
                Nearby but not listed? Call us — we will tell you honestly
                whether we can get to you.
              </p>
            </div>

            <div>
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                What to expect
              </h2>
              <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink-soft">
                <li>We call to schedule, usually within 3 business days.</li>
                <li>We bring real samples to your windows, in your own light.</li>
                <li>We measure each window and send you a written quote.</li>
                <li>No deposit is required to get a quote.</li>
              </ul>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
