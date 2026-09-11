import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/product/ProductParts";
import { business } from "@/content/business";

export const metadata: Metadata = {
  title: "Privacy Policy | Premier Shade Solutions",
  description:
    "How Premier Shade Solutions collects, uses, and protects the information you submit through this website.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        title="Privacy Policy"
        lead="Plain language, because you should be able to read this."
        trail={[{ name: "Privacy", url: "/privacy" }]}
      />

      <Section tone="ivory" containerWidth="prose">
        <div className="flex flex-col gap-8 leading-relaxed text-ink-soft">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              What we collect
            </h2>
            <p>
              When you submit a consultation request we collect the information
              you type into the form: your name, phone number, email address,
              and — if you provide them — your address, the treatments you are
              interested in, roughly how many windows you have, how you heard
              about us, and any notes you add.
            </p>
            <p>
              We do not ask for and do not want payment details, government
              identification, or any other sensitive information through this
              website.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              How we use it
            </h2>
            <p>
              We use it to contact you about your consultation and to prepare a
              quote. That is the entire purpose. We do not sell your
              information, we do not rent it, and we do not share it with
              advertisers or lead brokers.
            </p>
            <p>
              We may share what is necessary with a manufacturer or vendor to
              fulfill an order you have placed — for example, a shipping address
              for a delivery.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              How long we keep it
            </h2>
            <p>
              We keep consultation requests and customer records for as long as
              we are working with you and afterward for warranty and service
              purposes, since knowing exactly what was installed in your home
              matters when something needs repair years later.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              Your choices
            </h2>
            <p>
              You can ask us at any time to tell you what we hold about you, to
              correct it, or to delete it. Email{" "}
              <a href={`mailto:${business.email}`} className="underline underline-offset-2">
                {business.email}
              </a>{" "}
              or call{" "}
              <a href={business.phone.href} className="underline underline-offset-2">
                {business.phone.display}
              </a>{" "}
              and we will take care of it.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              This website
            </h2>
            <p>
              This site does not use advertising cookies or third-party tracking
              pixels. Our hosting provider records standard server request
              information, such as IP addresses and pages requested, to keep the
              site running and to protect it from abuse.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              Questions
            </h2>
            <p>
              {business.legalName} · {business.address.locality},{" "}
              {business.address.region} ·{" "}
              <a href={`mailto:${business.email}`} className="underline underline-offset-2">
                {business.email}
              </a>
            </p>
          </section>
        </div>
      </Section>
    </>
  );
}
